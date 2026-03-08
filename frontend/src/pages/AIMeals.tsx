import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecommendedDish {
  dish_id: number;
  dish_name: string;
  reason: string;
}

type MessageRole = "user" | "ai";

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  recommendedDishes?: RecommendedDish[];
  followUpSuggestions?: string[];
  error?: boolean;
}

interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface NutritionResult {
  bmr: number;
  tdee: number;
  recommended_calories: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number };
  activity_level: string;
  goal: string;
  model: string;
  used_fallback: boolean;
}

// ─── Tab type ─────────────────────────────────────────────────────────────────

type ActiveTab = "chat" | "estimator";

// ─── Prompt suggestions ───────────────────────────────────────────────────────

const ALL_PROMPTS = [
  "What's healthy at ISR today?",
  "High protein lunch ideas",
  "I want something under 400 calories",
  "What vegetarian options are there?",
  "Help me hit my macro goals",
  "Find me a light dinner option",
  "What can I eat before a workout?",
  "What's good at Ikenberry?",
  "I need gluten-free options",
  "Best post-workout meal at PAR?",
  "Compare protein options across halls",
  "Low carb dinner suggestions",
];
const CHAT_STORAGE_KEY = "smarteats_ai_chat_v1";

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ─── Dish recommendation card ─────────────────────────────────────────────────

function DishRecommendationCard({ dish, onClick }: { dish: RecommendedDish; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "var(--se-bg-elevated)",
        border: "1px solid var(--se-border)",
        borderRadius: 12,
        padding: "10px 14px",
        marginTop: 8,
        cursor: "pointer",
        transition: "border-color 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--se-primary)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--se-border)")}
    >
      <p
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--se-text-main)",
          margin: "0 0 4px",
        }}
      >
        {dish.dish_name}
      </p>
      <p style={{ fontSize: 12, color: "var(--se-text-muted)", margin: 0 }}>
        {dish.reason}
      </p>
    </button>
  );
}

// ─── Typing indicator ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, paddingBottom: 8 }}>
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

// ─── Nutrition Estimator form ─────────────────────────────────────────────────

function NutritionEstimator() {
  const [form, setForm] = useState({
    age: "",
    sex: "",
    weight_kg: "",
    height_cm: "",
    activity_level: "",
    goal: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NutritionResult | null>(null);
  const [error, setError] = useState("");

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError("");

    try {
      const payload = {
        age: parseInt(form.age),
        sex: form.sex,
        weight_kg: parseFloat(form.weight_kg),
        height_cm: parseFloat(form.height_cm),
        activity_level: form.activity_level,
        goal: form.goal,
      };

      const res = await axios.post(`${API_BASE}/nutrition-estimate/`, payload);
      setResult(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { errors?: string[]; error?: string } } };
      if (axiosErr.response?.data?.errors) {
        setError(axiosErr.response.data.errors.join(", "));
      } else if (axiosErr.response?.data?.error) {
        setError(axiosErr.response.data.error);
      } else {
        setError("Failed to reach the server. Make sure the backend is running.");
      }
    } finally {
      setLoading(false);
    }
  };

  const isValid =
    form.age && form.sex && form.weight_kg && form.height_cm && form.activity_level && form.goal;

  const selectStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 10,
    border: "1.5px solid var(--se-border)",
    background: "var(--se-bg-surface)",
    color: "var(--se-text-main)",
    fontSize: 14,
    outline: "none",
    appearance: "none",
    WebkitAppearance: "none",
  };

  const inputStyle: React.CSSProperties = {
    ...selectStyle,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--se-text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    marginBottom: 6,
    display: "block",
  };

  const goalLabels: Record<string, string> = {
    fat_loss: "Fat Loss (−500 cal deficit)",
    muscle_gain: "Muscle Gain (+300 cal surplus)",
    maintain: "Maintain Weight",
  };

  const activityLabels: Record<string, string> = {
    sedentary: "Sedentary (little/no exercise)",
    light: "Light (1–3 days/week)",
    moderate: "Moderate (3–5 days/week)",
    active: "Active (6–7 days/week)",
    very_active: "Very Active (2× daily)",
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
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
            margin: "0 auto 16px",
            color: "var(--se-primary)",
            fontWeight: 900,
          }}
        >
          ⚡
        </div>
        <h2
          style={{
            fontSize: "var(--se-text-h3)",
            fontWeight: "var(--se-weight-extrabold)",
            color: "var(--se-text-main)",
            margin: "0 0 6px",
          }}
        >
          Nutrition Estimator
        </h2>
        <p style={{ fontSize: 14, color: "var(--se-text-muted)", margin: 0, maxWidth: 360, marginLeft: "auto", marginRight: "auto" }}>
          Enter your details and our AI will estimate your daily calorie and macro needs.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: "var(--se-text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--se-text-faint)", margin: "0 0 8px" }}>
          Body Metrics
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>Age</label>
            <input
              type="number"
              placeholder="25"
              value={form.age}
              onChange={(e) => handleChange("age", e.target.value)}
              style={inputStyle}
              min={10}
              max={120}
            />
          </div>
          <div>
            <label style={labelStyle}>Sex</label>
            <select
              value={form.sex}
              onChange={(e) => handleChange("sex", e.target.value)}
              style={selectStyle}
            >
              <option value="">Select…</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Weight (kg)</label>
            <input
              type="number"
              placeholder="70"
              value={form.weight_kg}
              onChange={(e) => handleChange("weight_kg", e.target.value)}
              style={inputStyle}
              min={20}
              max={500}
              step="0.1"
            />
          </div>
          <div>
            <label style={labelStyle}>Height (cm)</label>
            <input
              type="number"
              placeholder="175"
              value={form.height_cm}
              onChange={(e) => handleChange("height_cm", e.target.value)}
              style={inputStyle}
              min={50}
              max={300}
              step="0.1"
            />
          </div>
        </div>

        <p style={{ fontSize: "var(--se-text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--se-text-faint)", margin: "16px 0 8px" }}>
          Goals
        </p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Activity Level</label>
          <select
            value={form.activity_level}
            onChange={(e) => handleChange("activity_level", e.target.value)}
            style={selectStyle}
          >
            <option value="">Select…</option>
            {Object.entries(activityLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Goal</label>
          <select
            value={form.goal}
            onChange={(e) => handleChange("goal", e.target.value)}
            style={selectStyle}
          >
            <option value="">Select…</option>
            {Object.entries(goalLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          disabled={!isValid || loading}
          style={{
            width: "100%",
            padding: "12px 24px",
            borderRadius: 12,
            border: "none",
            background: isValid && !loading ? "var(--se-primary)" : "var(--se-bg-subtle)",
            color: isValid && !loading ? "white" : "var(--se-text-faint)",
            fontSize: 15,
            fontWeight: 700,
            cursor: isValid && !loading ? "pointer" : "default",
            transition: "background 0.15s",
          }}
        >
          {loading ? "Analyzing…" : "Estimate My Nutrition"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: 20,
            padding: "12px 16px",
            borderRadius: 12,
            background: "var(--se-error-dim)",
            border: "1px solid var(--se-error)",
            color: "var(--se-error)",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 28 }}>
          {/* Main calorie card */}
          <div
            style={{
              background: "var(--se-bg-surface)",
              border: "1.5px solid var(--se-border)",
              borderRadius: 16,
              padding: "24px 20px",
              textAlign: "center",
              marginBottom: 16,
              boxShadow: "var(--se-shadow-sm)",
            }}
          >
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--se-text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                margin: "0 0 4px",
              }}
            >
              Recommended Daily Intake
            </p>
            <p
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: "var(--se-primary)",
                margin: "0 0 4px",
                lineHeight: 1.1,
              }}
            >
              {result.recommended_calories.toLocaleString()}
            </p>
            <p style={{ fontSize: 14, color: "var(--se-text-muted)", margin: 0 }}>
              kcal / day
            </p>
          </div>

          {/* BMR + TDEE */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div
              style={{
                background: "var(--se-bg-subtle)",
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                BMR
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "var(--se-text-main)", margin: 0 }}>
                {result.bmr.toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: "var(--se-text-muted)", margin: "2px 0 0" }}>kcal</p>
            </div>
            <div
              style={{
                background: "var(--se-bg-subtle)",
                borderRadius: 12,
                padding: "14px 16px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--se-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                TDEE
              </p>
              <p style={{ fontSize: 22, fontWeight: 800, color: "var(--se-text-main)", margin: 0 }}>
                {result.tdee.toLocaleString()}
              </p>
              <p style={{ fontSize: 12, color: "var(--se-text-muted)", margin: "2px 0 0" }}>kcal</p>
            </div>
          </div>

          {/* Macros */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            {[
              { label: "Protein", value: result.macros.protein_g, color: "var(--se-macro-protein)" },
              { label: "Carbs", value: result.macros.carbs_g, color: "var(--se-macro-carbs)" },
              { label: "Fat", value: result.macros.fat_g, color: "var(--se-macro-fat)" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  background: "var(--se-bg-surface)",
                  border: "1.5px solid var(--se-border)",
                  borderRadius: 12,
                  padding: "14px 12px",
                  textAlign: "center",
                  boxShadow: "var(--se-shadow-sm)",
                }}
              >
                <div style={{
                  width: "100%",
                  height: 4,
                  borderRadius: 2,
                  background: "var(--se-bg-subtle)",
                  margin: "0 0 8px",
                  overflow: "hidden",
                }}>
                  <div style={{
                    width: `${Math.min((value / (result.macros.protein_g + result.macros.carbs_g + result.macros.fat_g)) * 100, 100)}%`,
                    height: "100%",
                    borderRadius: 2,
                    background: color,
                  }} />
                </div>
                <p style={{ fontSize: 20, fontWeight: 800, color: "var(--se-text-main)", margin: "0 0 2px" }}>
                  {value}g
                </p>
                <p style={{ fontSize: 12, color: "var(--se-text-muted)", margin: 0 }}>{label}</p>
              </div>
            ))}
          </div>

          {/* Model info */}
          <p style={{ fontSize: 11, color: "var(--se-text-faint)", textAlign: "center", margin: "12px 0 0" }}>
            Powered by {result.model}
            {result.used_fallback && " (Mifflin-St Jeor fallback)"}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AIMeals() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const suggestions = useMemo(() => pickRandom(ALL_PROMPTS, 3), []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const restored: Message[] = parsed
        .filter((item) => item && typeof item === "object")
        .map((item) => {
          const role: MessageRole = item.role === "user" ? "user" : "ai";
          return {
            id: Number(item.id) || 0,
            role,
            text: String(item.text || ""),
            recommendedDishes: Array.isArray(item.recommendedDishes)
              ? item.recommendedDishes
              : undefined,
            followUpSuggestions: Array.isArray(item.followUpSuggestions)
              ? item.followUpSuggestions
              : undefined,
            error: Boolean(item.error),
          };
        })
        .filter((item) => item.id > 0 && item.text.trim().length > 0)
        .map((item) => ({
          ...item,
          recommendedDishes: Array.isArray(item.recommendedDishes)
            ? item.recommendedDishes
            : undefined,
          followUpSuggestions: Array.isArray(item.followUpSuggestions)
            ? item.followUpSuggestions
            : undefined,
        }));

      if (restored.length > 0) {
        setMessages(restored);
        nextId.current = Math.max(...restored.map((m) => m.id)) + 1;
      }
    } catch (err) {
      console.error("Failed to restore AI chat session", err);
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) {
      sessionStorage.removeItem(CHAT_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  const toHistory = (existingMessages: Message[]): ChatHistoryItem[] =>
    existingMessages
      .filter((m) => !m.error)
      .map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      }));

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const trimmed = text.trim();
    const userMsg: Message = { id: nextId.current++, role: "user", text: trimmed };
    const history = toHistory(messages);
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = localStorage.getItem("authToken");
      const res = await axios.post(`${API_BASE}/ai-chat/`, {
        message: trimmed,
        history,
      }, token ? { headers: { Authorization: `Token ${token}` } } : undefined);

      const data = res.data;

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          { id: nextId.current++, role: "ai", text: data.error, error: true },
        ]);
      } else {
        const aiMsg: Message = {
          id: nextId.current++,
          role: "ai",
          text: data.response || "I'm not sure how to help with that.",
          recommendedDishes: data.recommended_dishes?.length > 0 ? data.recommended_dishes : undefined,
          followUpSuggestions: data.follow_up_suggestions?.length > 0 ? data.follow_up_suggestions : undefined,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
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
        {/* ── Tab bar ──────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingBottom: 16,
            flexShrink: 0,
          }}
        >
          <div style={{
            display: "inline-flex",
            background: "var(--se-bg-subtle)",
            borderRadius: "var(--se-radius-full)",
            padding: 3,
            gap: 2,
          }}>
            {[{ key: "chat", label: "AI Chat" }, { key: "estimator", label: "Nutrition Estimator" }].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as ActiveTab)}
                style={{
                  padding: "8px 20px",
                  borderRadius: "var(--se-radius-full)",
                  border: "none",
                  fontSize: "var(--se-text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 150ms ease",
                  background: activeTab === tab.key ? "var(--se-bg-surface)" : "transparent",
                  color: activeTab === tab.key ? "var(--se-text-main)" : "var(--se-text-muted)",
                  boxShadow: activeTab === tab.key ? "var(--se-shadow-sm)" : "none",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Estimator tab ──────────────────────────────────── */}
        {activeTab === "estimator" ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0 16px" }}>
            <NutritionEstimator />
          </div>
        ) : (
          <>
            {/* ── Chat messages area ──────────────────────────── */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: isEmpty ? "0" : "8px 0 16px",
              }}
            >
              {isEmpty ? (
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
                          transition: "border-color 0.1s, box-shadow 0.1s, transform 0.1s, background 0.1s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "var(--se-primary)";
                          e.currentTarget.style.color = "var(--se-text-main)";
                          e.currentTarget.style.transform = "translateY(-1px)";
                          e.currentTarget.style.background = "var(--se-bg-elevated)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "var(--se-border)";
                          e.currentTarget.style.color = "var(--se-text-secondary)";
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.background = "var(--se-bg-surface)";
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
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

                      <div
                        style={{
                          maxWidth: "75%",
                          padding: "11px 15px",
                          borderRadius:
                            msg.role === "user"
                              ? "var(--se-radius-xl) var(--se-radius-xl) var(--se-radius-sm) var(--se-radius-xl)"
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
                        {msg.recommendedDishes?.map((dish) => (
                          <DishRecommendationCard
                            key={dish.dish_id}
                            dish={dish}
                            onClick={() =>
                              navigate(`/dishes/${dish.dish_id}`, {
                                state: { from: "/aimeals" },
                              })
                            }
                          />
                        ))}
                        {msg.followUpSuggestions && msg.followUpSuggestions.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                            {msg.followUpSuggestions.map((suggestion) => (
                              <button
                                key={`${msg.id}-${suggestion}`}
                                type="button"
                                disabled={loading}
                                onClick={() => sendMessage(suggestion)}
                                style={{
                                  fontSize: "var(--se-text-sm)",
                                  borderRadius: "var(--se-radius-full)",
                                  border: "1px solid var(--se-border)",
                                  background: "var(--se-bg-elevated)",
                                  color: "var(--se-text-secondary)",
                                  padding: "6px 14px",
                                  cursor: loading ? "default" : "pointer",
                                }}
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

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
              {!isEmpty && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      nextId.current = 1;
                      sessionStorage.removeItem(CHAT_STORAGE_KEY);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--se-text-faint)",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "2px 4px",
                    }}
                  >
                    New chat
                  </button>
                </div>
              )}
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
                    boxShadow: "var(--se-shadow-sm)",
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

            </div>
          </>
        )}
      </div>
    </>
  );
}
