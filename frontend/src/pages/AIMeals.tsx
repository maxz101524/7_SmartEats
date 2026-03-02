import { useState, useEffect, useRef, useMemo } from "react";
import { API_BASE } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MealResult {
  meal_id: number;
  meal_name: string;
  total_nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  dishes_contained: { name: string; weight: number }[];
}

type MessageRole = "user" | "ai";

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  meals?: MealResult[];
  error?: boolean;
}

// ─── Prompt suggestions ───────────────────────────────────────────────────────

const ALL_PROMPTS = [
  "Ask anything about any dining hall",
  "What's on your mind today?",
  "Ready to get in some protein?",
  "What's healthy at ISR?",
  "I want something under 400 calories",
  "High protein lunch ideas",
  "Help me hit my macro goals",
  "What vegetarian options are there?",
  "What's good at Allen today?",
  "I'm in the mood for pasta",
  "Find me a light dinner option",
  "What can I eat before a workout?",
];

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ─── Meal result card ─────────────────────────────────────────────────────────

function MealCard({ meal }: { meal: MealResult }) {
  const macros = [
    { label: "Cal", value: meal.total_nutrition.calories, unit: "kcal", color: "var(--se-macro-cal)" },
    { label: "Pro", value: meal.total_nutrition.protein, unit: "g", color: "var(--se-macro-protein)" },
    { label: "Carb", value: meal.total_nutrition.carbs, unit: "g", color: "var(--se-macro-carbs)" },
    { label: "Fat", value: meal.total_nutrition.fat, unit: "g", color: "var(--se-macro-fat)" },
  ];

  return (
    <div
      style={{
        background: "var(--se-bg-elevated)",
        border: "1px solid var(--se-border)",
        borderRadius: 12,
        padding: "12px 14px",
        marginTop: 8,
      }}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--se-text-main)",
          marginBottom: 8,
        }}
      >
        {meal.meal_name}
      </p>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {macros.map(({ label, value, unit, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: "center",
              background: "var(--se-bg-surface)",
              border: "1px solid var(--se-border)",
              borderRadius: 8,
              padding: "4px 0",
            }}
          >
            <p style={{ fontSize: 9, fontWeight: 700, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>
              {label}
            </p>
            <p style={{ fontSize: 12, fontWeight: 800, color, margin: 0 }}>
              {value}{unit}
            </p>
          </div>
        ))}
      </div>
      {meal.dishes_contained.length > 0 && (
        <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: 0 }}>
          {meal.dishes_contained.map((d) => d.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 8 }}>
      {/* AI avatar */}
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "var(--se-primary-dim)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        ✦
      </div>
      <div
        style={{
          background: "var(--se-bg-surface)",
          border: "1px solid var(--se-border)",
          borderRadius: "18px 18px 18px 4px",
          padding: "12px 16px",
          display: "flex",
          gap: 5,
          alignItems: "center",
          boxShadow: "var(--se-shadow-sm)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--se-text-faint)",
              animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AIMeals() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  // Pick 3 prompt suggestions once per mount
  const suggestions = useMemo(() => pickRandom(ALL_PROMPTS, 3), []);

  // Auto-scroll to latest message within the container (not the window)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: nextId.current++, role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("dishes", text.trim());

      const res = await fetch(`${API_BASE}/aimeals/`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const meals: MealResult[] = data.results ?? [];

      const aiMsg: Message = {
        id: nextId.current++,
        role: "ai",
        text:
          meals.length > 0
            ? `Here are ${meals.length} meal${meals.length > 1 ? "s" : ""} I found for you:`
            : "I couldn't find any meals matching that. Try different keywords — like a specific dish name or ingredient.",
        meals: meals.length > 0 ? meals : undefined,
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "ai",
          text: "Something went wrong reaching the server. Make sure the backend is running.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Keyframes for typing dots */}
      <style>{`
        @keyframes dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: "calc(100vh - 76px - 48px)",
          maxWidth: 720,
          margin: "0 auto",
        }}
      >
        {/* ── Messages area ─────────────────────────────────────── */}
        <div
          ref={messagesContainerRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isEmpty ? "0" : "8px 0 16px",
          }}
        >
          {isEmpty ? (
            /* ── Empty state: greeting + suggestion prompts ── */
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                padding: "0 16px",
                textAlign: "center",
              }}
            >
              {/* Logo mark */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: "var(--se-primary-dim)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  marginBottom: 16,
                  color: "var(--se-primary)",
                  fontWeight: 900,
                }}
              >
                ✦
              </div>
              <h1
                style={{
                  fontSize: "var(--se-text-h2)",
                  fontWeight: "var(--se-weight-extrabold)",
                  color: "var(--se-text-main)",
                  margin: "0 0 6px",
                }}
              >
                <span className="text-gradient-vivid">SmartEats AI</span>
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: "var(--se-text-muted)",
                  marginBottom: 32,
                  maxWidth: 320,
                }}
              >
                Ask about dining options, nutrition, or meal ideas across all UIUC dining halls.
              </p>

              {/* Suggestion chips */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  width: "100%",
                  maxWidth: 480,
                }}
              >
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    style={{
                      padding: "12px 18px",
                      borderRadius: 12,
                      border: "1.5px solid var(--se-border)",
                      background: "var(--se-bg-surface)",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: 14,
                      color: "var(--se-text-secondary)",
                      fontWeight: 500,
                      boxShadow: "var(--se-shadow-sm)",
                      transition: "border-color 0.1s, box-shadow 0.1s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--se-primary)";
                      e.currentTarget.style.color = "var(--se-text-main)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--se-border)";
                      e.currentTarget.style.color = "var(--se-text-secondary)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* ── Message bubbles ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: msg.role === "user" ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: 10,
                  }}
                >
                  {/* AI avatar */}
                  {msg.role === "ai" && (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: "var(--se-primary-dim)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        flexShrink: 0,
                        color: "var(--se-primary)",
                        fontWeight: 900,
                      }}
                    >
                      ✦
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "11px 15px",
                      borderRadius:
                        msg.role === "user"
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                      background:
                        msg.role === "user"
                          ? "var(--se-primary)"
                          : msg.error
                          ? "var(--se-error-dim)"
                          : "var(--se-bg-surface)",
                      border:
                        msg.role === "user"
                          ? "none"
                          : `1px solid ${msg.error ? "var(--se-error)" : "var(--se-border)"}`,
                      boxShadow:
                        msg.role === "ai" ? "var(--se-shadow-sm)" : "none",
                      color:
                        msg.role === "user"
                          ? "white"
                          : msg.error
                          ? "var(--se-error)"
                          : "var(--se-text-main)",
                      fontSize: 14,
                      lineHeight: 1.5,
                    }}
                  >
                    <p style={{ margin: 0 }}>{msg.text}</p>
                    {/* Meal result cards */}
                    {msg.meals?.map((meal) => (
                      <MealCard key={meal.meal_id} meal={meal} />
                    ))}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && <TypingDots />}
            </div>
          )}
        </div>

        {/* ── Input bar ─────────────────────────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            paddingTop: 12,
            borderTop: "1px solid var(--se-border)",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              background: "var(--se-bg-surface)",
              border: "1.5px solid var(--se-border)",
              borderRadius: 9999,
              padding: "6px 6px 6px 18px",
              boxShadow: "var(--se-shadow-sm)",
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLFormElement).style.borderColor =
                "var(--se-primary)";
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLFormElement).style.borderColor =
                "var(--se-border)";
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask about dining halls, dishes, or nutrition…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 14,
                color: "var(--se-text-main)",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  input.trim() && !loading
                    ? "var(--se-primary)"
                    : "var(--se-bg-subtle)",
                border: "none",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
              aria-label="Send"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke={input.trim() && !loading ? "white" : "var(--se-text-faint)"}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </form>
          <p
            style={{
              textAlign: "center",
              fontSize: 11,
              color: "var(--se-text-faint)",
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            SmartEats AI · UIUC Dining
          </p>
        </div>
      </div>
    </>
  );
}
