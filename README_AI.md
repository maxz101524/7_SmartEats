# SmartEats AI — System Description

## 1. Data Input

User data is captured through two input methods:

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

---

## 2. Preprocessing

### Nutrition Estimator
1. **JSON parsing** — Request body is parsed; malformed JSON returns 400.
2. **Type coercion** — Age is cast to `int`, weight/height to `float`. Invalid types are rejected.
3. **Range validation** — Each numeric field is bounds-checked (e.g., age 10–120, weight 20–500 kg).
4. **Enum validation** — Sex, activity level, and goal must match predefined allowed values.
5. **Prompt construction** — Validated inputs are formatted into a zero-shot prompt:
   ```
   How many calories does a 25-year-old man who weighs 80kg and is 175 cm tall need per day?
   Respond in this exact format:
   BMR: X kcal
   TDEE (sedentary): X kcal
   TDEE (moderately active): X kcal
   TDEE (very active): X kcal
   ```

### AI Chat
1. **Message sanitization** — Messages are trimmed; empty messages are rejected.
2. **History normalization** — Chat history is validated, truncated to 16 messages, and formatted with role labels for the Gemini API.
3. **Menu context injection** — Current UIUC dining hall menu data is fetched from the database and injected into the system prompt.

---

## 3. Safety Guardrails

### Input Safety
- **Strict bounds checking** on all numeric fields prevents nonsensical inputs (e.g., age = 999, weight = -50).
- **Enum whitelisting** for sex, activity level, and goal prevents injection of arbitrary values.
- **JSON-only parsing** — No form data or URL parameters; only structured JSON is accepted.
- **Calorie floor** — Recommended daily calories never drop below 1,200 kcal regardless of goal adjustments.

### Output Safety
- **Regex-based parsing** — The LLM's text output is parsed with strict regex patterns. Only numeric values matching expected formats (e.g., `BMR: 1800 kcal`) are extracted.
- **Mifflin-St Jeor fallback** — If the LLM produces unparseable output, the system falls back to the standard Mifflin-St Jeor equation to guarantee valid results.
- **No raw LLM text exposed** — The raw model output is never sent to the client; only the parsed/computed numeric values are returned.

### AI Chat Safety
- **Response validation** — Gemini responses are parsed as JSON; malformed responses return a user-friendly error.
- **Dish grounding** — Recommended dishes are validated against the actual database; hallucinated dishes are filtered out.
- **Follow-up sanitization** — Suggested follow-up questions are deduplicated and length-capped.

### Infrastructure
- **API keys** stored in `.env` file, excluded from Git via `.gitignore`.
- **Model weights** (`*.bin`, `*.safetensors`, `*.pt`) excluded from Git via `.gitignore`.
- **Lazy model loading** — The local LLM is only loaded on first request, preventing slow server startup.
