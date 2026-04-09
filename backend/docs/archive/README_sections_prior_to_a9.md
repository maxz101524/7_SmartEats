# Archived README content — prior to A9

The following content was in README.md and README_AI.md before the A9 semantic search feature was added.
Preserved here for reference.

---

## README.md (pre-A9)

### A6 scope (Text Intelligence — Local LLM + API Integration)

#### Part 1: Hugging Face Leaderboard Lab (`llm-test/`)

- **15 models** tested across 5 size categories: Ultra-Light (<1B), Small (1B–3B), Medium (3B–5B), Large (5B–7B), Extra-Large (7B–10B+).
- **Prompt engineering:** Zero-shot, one-shot, few-shot, and many-shot prompting evaluated.
- **Evaluation criteria:** Instruction adherence, reasoning accuracy, prompt stability, inference speed.
- **Selected model:** `stabilityai/stablelm-2-zephyr-1_6b` — best balance of accuracy, speed (~1.5s), and structured output formatting.

#### Part 2: Django Integration

##### §1 — System Description (`README_AI.md`)
Documents Data Input, Preprocessing, and Safety Guardrails for both the local LLM and Gemini API features.

##### §2 — Local LLM in Django (`services/local_llm.py`)
- **Model:** `stabilityai/stablelm-2-zephyr-1_6b` via `transformers` — auto-downloads weights on first run.
- **Endpoint:** `POST /api/nutrition-estimate/` — accepts age, sex, weight, height, activity level, and goal.
- Input validation (type, range, enum whitelisting) → zero-shot prompt → regex parsing → Mifflin-St Jeor fallback.
- Returns BMR, TDEE, recommended daily calories, and macro breakdown (protein/carbs/fat).
- **Environment toggle:** `USE_LOCAL_LLM=true` (default) loads the real model. Set `USE_LOCAL_LLM=false` on Render to use Mifflin-St Jeor fallback within 512MB memory.

##### §3 — External API Integration (Gemini)
- `gemini_client.py` — AI-powered dish nutrition estimation.
- `ai_chat.py` — Conversational AI chatbot with dining hall menu context, dish recommendations, and follow-up suggestions.
- API key stored in `.env`, excluded from Git.

#### Part 3: Reflection (`backend/docs/05_notes/notes.txt`)
Answers to all four production reflection questions:
1. Size vs. Quality Trade-off
2. Cost & Scaling (10,000 daily users)
3. Hybrid Potential (local + API)
4. Cost Comparison (pre-trained vs. paid API)

#### Frontend: AI Nutrition Hub (`AIMeals.tsx`)
Tabbed interface with two features:
- **AI Chat** — Gemini-powered chatbot for dining recommendations.
- **Nutrition Estimator** — Form that calls the local LLM endpoint and displays BMR, TDEE, recommended calories, and macros.

---

## README_AI.md (pre-A9)

# SmartEats AI — System Description

## 1. Data Input

### Nutrition Estimator (Local LLM)
An onboarding-style form on the AI Meals page collects:
- **Age** (integer, 10–120)
- **Sex** (male / female)
- **Weight** in kilograms (20–500 kg)
- **Height** in centimeters (50–300 cm)
- **Activity level** (sedentary, light, moderate, active, very active)
- **Fitness goal** (fat loss, muscle gain, maintain)

This data is sent as JSON via `POST /api/nutrition-estimate/` to the Django backend.

### AI Chat (Gemini API)
Free-text messages sent through the chat interface on the same page. If the user is authenticated, their profile data (name, age, sex, height, weight, goal) is automatically included as context.

## 2. Preprocessing

### Nutrition Estimator
1. **JSON parsing** — Request body is parsed; malformed JSON returns 400.
2. **Type coercion** — Age is cast to `int`, weight/height to `float`. Invalid types are rejected.
3. **Range validation** — Each numeric field is bounds-checked (e.g., age 10–120, weight 20–500 kg).
4. **Enum validation** — Sex, activity level, and goal must match predefined allowed values.
5. **Prompt construction** — Validated inputs are formatted into a zero-shot prompt.

### AI Chat
1. **Message sanitization** — Messages are trimmed; empty messages are rejected.
2. **History normalization** — Chat history is validated, truncated to 16 messages, and formatted with role labels for the Gemini API.
3. **Menu context injection** — Current UIUC dining hall menu data is fetched from the database and injected into the system prompt.

## 3. Safety Guardrails

### Input Safety
- **Strict bounds checking** on all numeric fields prevents nonsensical inputs.
- **Enum whitelisting** for sex, activity level, and goal.
- **JSON-only parsing** — No form data or URL parameters.
- **Calorie floor** — Recommended daily calories never drop below 1,200 kcal.

### Output Safety
- **Regex-based parsing** — Only numeric values matching expected formats are extracted.
- **Mifflin-St Jeor fallback** — If the LLM produces unparseable output, falls back to standard equation.
- **No raw LLM text exposed** — Only parsed/computed numeric values are returned.

### AI Chat Safety
- **Response validation** — Gemini responses are parsed as JSON; malformed responses return a user-friendly error.
- **Dish grounding** — Recommended dishes are validated against the actual database.
- **Follow-up sanitization** — Suggested follow-up questions are deduplicated and length-capped.

### Infrastructure
- **API keys** stored in `.env` file, excluded from Git.
- **Model weights** (`*.bin`, `*.safetensors`, `*.pt`) excluded from Git.
- **Lazy model loading** — The local LLM is only loaded on first request.
