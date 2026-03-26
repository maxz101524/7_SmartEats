# SmartEats — Multi-Model AI System Design

## Part 3: Multi-Model Routing Strategy

### Step 3.1: Five System Scenarios

SmartEats is a campus dining discovery and meal-tracking app at UIUC. Our AI features
span five task types: **classification** (fitness goal labeling, eating-habit tagging),
**prediction** (calorie surplus/deficit forecasting, weight trends), **structured
extraction** (parsing meal log entries into nutrients), **summarization** (weekly
nutrition reports), and **text generation** (personalized meal recommendations and
coaching advice). The scenarios below show some of the realistic operational states that demand
different routing trade-offs.

| # | Scenario                             | Description                                                                                                                                                                                                                                                                                      |
| - | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | **Normal Operation**           | Standard weekday traffic (~1 000 DAU - Daily Active Users). A balanced mix of all five prompt types arrives at a steady, predictable rate. Latency budgets are relaxed (< 3 s acceptable) and API cost is within the monthly allocation.                                                         |
| 2 | **Meal Rush Hours**            | Peak lunch (11 AM – 1 PM) and dinner (5 – 7 PM) windows where request volume spikes 5–8× above baseline. Most queries are fast lookups: menu classification, quick meal logging (structured extraction) rather than deep analysis. Response time must stay under 1 s to keep the UX snappy. |
| 3 | **Complex Nutrition Analysis** | Users request detailed AI meal plans, weekly nutrition summaries, or multi-day trend predictions. These prompts need deeper reasoning and longer outputs. Volume is low (< 5 % of traffic), but each request is high-value and quality-sensitive.                                                |
| 4 | **Cost Optimization Mode**     | The monthly Hugging Face Inference API budget is ≥ 80 % consumed with days remaining. The system must aggressively shift work to local models and reserve paid API calls for only the most quality-critical requests.                                                                           |
| 5 | **Exam-Week Surge**            | During midterm/finals weeks, DAU doubles campus-wide while request complexity also rises (stress-eating analysis, study-snack recommendations). The system faces both high volume*and* more complex queries simultaneously, risking server overload and budget blow-out.                       |

#### Reasoning

* **Scenarios 1–2** cover the daily traffic cycle every production system must handle.
* **Scenario 3** isolates the quality-vs-speed tension inherent in LLM routing.
* **Scenario 4** adds the cost dimension — a hard operational constraint.
* **Scenario 5** stress-tests the system with the worst-case combination of all three pressures (volume, complexity, cost).

---

### Step 3.2: Routing Strategies

All strategies draw on the Part 1 benchmark results (15 models, 375 evaluations).
The key performance tiers derived from the data:

| Tier                    | Models                                                        | Avg Score    | Avg Latency    | Role                                        |
| ----------------------- | ------------------------------------------------------------- | ------------ | -------------- | ------------------------------------------- |
| **Speed tier**    | stablelm-2-zephyr-1_6b (Small), stablelm-zephyr-3b (Medium)   | 3.26 – 3.46 | 0.63 – 0.87 s | Sub-second responses for simple tasks       |
| **Quality tier**  | vicuna-7b (Extra-Large), Nous-Hermes-2-Mistral-7B (Large)     | 3.44 – 3.47 | 1.52 – 1.76 s | Best output quality for complex reasoning   |
| **Balanced tier** | zephyr-7b-beta (Large), Phi-3-mini-4k (Medium)                | 3.16 – 3.22 | 1.76 – 2.08 s | Good quality with moderate latency          |
| **API fallback**  | SOLAR-10.7B-Instruct-v1.0 (Extra-Large, via HF Inference API) | 3.45         | 9.14 s         | Highest quality when latency isn't critical |

---

#### Scenario 1 — Normal Operation

| Attribute                   | Value                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Routing Strategy**  | Prompt-type-aware static routing: each prompt type maps to its empirically best local model.                                                                                                                                          |
| **Local Models Used** | vicuna-7b (classification — score 3.80, lat 0.27 s), stablelm-zephyr-3b (text generation — 3.50, 0.81 s; summarization — 3.60, 0.99 s), stablelm-2-zephyr-1_6b (structured extraction — 2.60, 0.65 s; prediction — 3.43, 0.72 s) |
| **HF API Model Used** | None (local models handle all traffic under normal load)                                                                                                                                                                              |
| **Routing Condition** | `system_load < 60%` AND `api_budget_remaining > 20%`                                                                                                                                                                              |
| **Expected Benefit**  | Zero API cost during normal hours; predictable latency < 1.5 s for all task types; maximum use of local GPU resources.                                                                                                                |

**How it works:** An incoming request is tagged by prompt type (a lightweight regex/keyword classifier on the prompt). The router looks up the pre-assigned model for that type and dispatches. Because volume is low and steady, a single local GPU server handles the full mix without queuing.

---

#### Scenario 2 — Meal Rush Hours

| Attribute                   | Value                                                                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Routing Strategy**  | Speed-first routing with complexity gating. Simple requests (classification, structured extraction) go to the fastest local model. Only complex requests (prediction, summarization, text generation with prompt length > 200 tokens) are allowed through to larger models. |
| **Local Models Used** | stablelm-2-zephyr-1_6b (all simple tasks — lat 0.63 s), stablelm-zephyr-3b (complex tasks — lat 0.87 s)                                                                                                                                                                   |
| **HF API Model Used** | Nous-Hermes-2-Mistral-7B-DPO (overflow queue — score 3.44, moderate API cost)                                                                                                                                                                                              |
| **Routing Condition** | `prompt_type ∈ {classification, structured_extraction}` → speed tier; `prompt_length > 200` → medium tier; `queue_depth > 50` → overflow to HF API                                                                                                                |
| **Expected Benefit**  | 95th-percentile latency stays under 1 s during peak. API is only invoked for overflow (~5–10 % of peak requests), capping cost.                                                                                                                                            |

**How it works:** During detected rush windows (time-of-day trigger or rolling request-rate threshold), the router switches to speed-first mode. The small stablelm-2-zephyr-1_6b handles the majority of quick classification/extraction hits at sub-second latency. If the local queue depth exceeds 50 pending requests, the router spills excess to the Hugging Face Inference API running Nous-Hermes-2-Mistral-7B, which provides comparable quality without saturating local hardware.

---

#### Scenario 3 — Complex Nutrition Analysis

| Attribute                   | Value                                                                                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Routing Strategy**  | Quality-first routing with API escalation. Complex prompts are sent to the highest-scoring local model first. If the model's output confidence score (self-reported or heuristic-based) is below a threshold, the request is re-routed to the premium API model. |
| **Local Models Used** | vicuna-7b (primary — score 3.47, lat 1.52 s), Nous-Hermes-2-Mistral-7B (secondary — score 3.44, lat 1.76 s)                                                                                                                                                    |
| **HF API Model Used** | SOLAR-10.7B-Instruct-v1.0 (escalation — score 3.45, highest quality for detailed analysis)                                                                                                                                                                      |
| **Routing Condition** | `prompt_complexity == high` → vicuna-7b; if `confidence_score < 0.7` → retry with SOLAR-10.7B via API                                                                                                                                                      |
| **Expected Benefit**  | Best possible output quality for high-value requests. Only ~15–20 % of complex requests need API escalation, keeping costs controlled while ensuring no low-quality responses reach the user.                                                                   |

**How it works:** Prompt complexity is estimated from token count, presence of multi-step instructions, and prompt type (prediction + summarization are flagged complex by default). The router sends these to vicuna-7b locally. A lightweight post-generation check evaluates whether the response is well-structured and sufficiently detailed (using a format validation heuristic). If the check fails, the same prompt is re-sent to SOLAR-10.7B via the HF API for a higher-quality response.

---

#### Scenario 4 — Cost Optimization Mode

| Attribute                   | Value                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Routing Strategy**  | Local-only routing with API gating. All requests are handled by local models regardless of complexity. The HF API is reserved exclusively for user-initiated "premium" requests (e.g., detailed multi-day meal plans).               |
| **Local Models Used** | stablelm-2-zephyr-1_6b (simple tasks), stablelm-zephyr-3b (medium complexity), vicuna-7b (complex tasks)                                                                                                                             |
| **HF API Model Used** | SOLAR-10.7B (only for explicit premium requests, rate-limited to ≤ 50 calls/day)                                                                                                                                                    |
| **Routing Condition** | `api_budget_remaining < 20%` triggers this mode; all routing stays local; API calls require `user_requested_premium == true` AND `daily_api_calls < 50`                                                                        |
| **Expected Benefit**  | Near-zero API spend for the remainder of the billing period. Quality dips slightly for the most complex tasks (vicuna-7b scores 3.47 vs SOLAR's 3.45 — negligible difference) but latency improves dramatically (1.52 s vs 9.14 s). |

**How it works:** A budget monitor tracks cumulative HF API spend. When the threshold is crossed, the router flips a global flag that blocks all automatic API escalation. The three-tier local cascade (speed → balanced → quality) handles the full traffic mix. Users can still opt into a "Premium Analysis" button in the UI, which sends exactly one API call — subject to the daily rate limit.

---

#### Scenario 5 — Exam-Week Surge

| Attribute                   | Value                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Routing Strategy**  | Adaptive tiered routing with dynamic load balancing. Combines rush-hour speed optimizations with quality escalation for complex queries, mediated by real-time system load. As load increases, the router progressively shifts traffic from quality-tier to speed-tier models.              |
| **Local Models Used** | stablelm-2-zephyr-1_6b (primary workhorse — lat 0.63 s), stablelm-zephyr-3b (secondary — lat 0.87 s), vicuna-7b (reserved for high-complexity at < 80% load)                                                                                                                              |
| **HF API Model Used** | Nous-Hermes-2-Mistral-7B-DPO (overflow for complex tasks when local queue saturates)                                                                                                                                                                                                        |
| **Routing Condition** | `system_load < 50%` → normal routing (Scenario 1); `50% ≤ load < 80%` → speed-first (Scenario 2); `load ≥ 80%` → all-speed mode (everything to stablelm-2-zephyr-1_6b, complex overflow to API); `load ≥ 95%` → shed low-priority requests (return cached/generic responses) |
| **Expected Benefit**  | Graceful degradation under extreme load. The system never fully breaks — it trades quality for throughput progressively. API spending is bounded by overflow-only usage (~10–15 % of surge traffic). Load shedding at 95 % prevents server crashes.                                       |

**How it works:** A load monitor feeds real-time CPU/GPU utilization and request queue depth into the router. Four load tiers (normal → elevated → high → critical) each activate a progressively more aggressive routing policy. At the critical tier, the system returns pre-cached generic responses for low-priority prompt types (e.g., general text generation) while preserving API access for classification and prediction tasks that directly affect meal logging accuracy.

---

### Summary Table

| Scenario          | Primary Local Model                                   | Secondary Local Model    | HF API Model             | Routing Trigger                 | Quality Target          | Latency Target   |
| ----------------- | ----------------------------------------------------- | ------------------------ | ------------------------ | ------------------------------- | ----------------------- | ---------------- |
| Normal Operation  | vicuna-7b, stablelm-zephyr-3b, stablelm-2-zephyr-1_6b | —                       | None                     | `load < 60%`                  | Maximize                | < 1.5 s          |
| Meal Rush Hours   | stablelm-2-zephyr-1_6b                                | stablelm-zephyr-3b       | Nous-Hermes-2-Mistral-7B | `request_rate > 5× baseline` | Acceptable              | < 1.0 s          |
| Complex Analysis  | vicuna-7b                                             | Nous-Hermes-2-Mistral-7B | SOLAR-10.7B              | `complexity == high`          | Maximize                | < 10 s           |
| Cost Optimization | stablelm-2-zephyr-1_6b, stablelm-zephyr-3b, vicuna-7b | —                       | SOLAR-10.7B (≤ 50/day)  | `budget < 20%`                | Good enough             | < 2 s            |
| Exam-Week Surge   | stablelm-2-zephyr-1_6b                                | stablelm-zephyr-3b       | Nous-Hermes-2-Mistral-7B | `load` tier bands             | Progressive degradation | < 1.5 s (target) |
