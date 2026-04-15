import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { API_BASE } from "../config";
import { useMealTray } from "../mealTray";
import { useToast } from "../components/useToast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecommendedDish {
  dish_id: number;
  dish_name: string;
  reason: string;
  dining_hall_name?: string;
  hall_name?: string;
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  quantity?: number;
}

interface MealPlan {
  title: string;
  summary?: string;
  note?: string;
  action_label?: string;
  items: RecommendedDish[];
  totals?: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  };
  remaining_after?: {
    calories: number;
    protein: number;
    carbohydrates: number;
    fat: number;
  };
}

type MessageRole = "user" | "ai";

interface Message {
  id: number;
  role: MessageRole;
  text: string;
  recommendedDishes?: RecommendedDish[];
  mealPlan?: MealPlan;
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

interface DailyIntake {
  consumed: { calories: number; protein: number; carbs: number; fat: number };
  goals: { calories: number; protein: number; carbs: number; fat: number } | null;
  goals_set: boolean;
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
const ASSISTANT_STYLE_PREFIXES = [
  "are you",
  "do you",
  "would you",
  "could you",
  "can you",
  "what kind of",
  "which kind of",
] as const;

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function sanitizeFollowUpSuggestions(rawSuggestions: unknown): string[] | undefined {
  if (!Array.isArray(rawSuggestions)) return undefined;

  const cleaned = rawSuggestions
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0 && item.length <= 80)
    .filter((item) => {
      const normalized = item.toLowerCase();
      return !ASSISTANT_STYLE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    })
    .filter((item, index, arr) => arr.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 3);

  return cleaned.length > 0 ? cleaned : undefined;
}

function sanitizeRecommendedDishes(rawDishes: unknown): RecommendedDish[] | undefined {
  if (!Array.isArray(rawDishes)) return undefined;

  const dishes = rawDishes
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const dishId = Number(item.dish_id);
      const dishName = String(item.dish_name || "").trim();
      const reason = String(item.reason || "").trim();
      if (!Number.isInteger(dishId) || dishId <= 0 || !dishName) return null;

      const dish: RecommendedDish = {
        dish_id: dishId,
        dish_name: dishName,
        reason,
      };

      const stringFields = [
        "dining_hall_name",
        "hall_name",
        "serving_unit",
        "serving_size",
        "meal_period",
      ] as const;
      stringFields.forEach((field) => {
        const value = item[field];
        if (typeof value === "string" && value.trim()) {
          dish[field] = value.trim();
        }
      });

      const numberFields = ["calories", "protein", "carbohydrates", "fat", "quantity"] as const;
      numberFields.forEach((field) => {
        const value = Number(item[field]);
        if (Number.isFinite(value)) {
          dish[field] = value;
        }
      });

      return dish;
    })
    .filter((dish): dish is RecommendedDish => dish !== null);

  return dishes.length > 0 ? dishes : undefined;
}

function sanitizeMealPlan(rawPlan: unknown): MealPlan | undefined {
  if (!rawPlan || typeof rawPlan !== "object") return undefined;

  const plan = rawPlan as Record<string, unknown>;
  const title = String(plan.title || "Suggested meal plan").trim();
  const items = sanitizeRecommendedDishes(plan.items);
  if (!items?.length) return undefined;

  const totals =
    plan.totals && typeof plan.totals === "object"
      ? (plan.totals as Record<string, unknown>)
      : null;
  const remainingAfter =
    plan.remaining_after && typeof plan.remaining_after === "object"
      ? (plan.remaining_after as Record<string, unknown>)
      : null;

  return {
    title,
    summary: typeof plan.summary === "string" ? plan.summary : undefined,
    note: typeof plan.note === "string" ? plan.note : undefined,
    action_label: typeof plan.action_label === "string" ? plan.action_label : undefined,
    items,
    totals: totals
      ? {
          calories: Number(totals.calories) || 0,
          protein: Number(totals.protein) || 0,
          carbohydrates: Number(totals.carbohydrates) || 0,
          fat: Number(totals.fat) || 0,
        }
      : undefined,
    remaining_after: remainingAfter
      ? {
          calories: Number(remainingAfter.calories) || 0,
          protein: Number(remainingAfter.protein) || 0,
          carbohydrates: Number(remainingAfter.carbohydrates) || 0,
          fat: Number(remainingAfter.fat) || 0,
        }
      : undefined,
  };
}

function getDishHall(dish: RecommendedDish) {
  return dish.hall_name || dish.dining_hall_name || "";
}

function hasDishNutrition(dish: RecommendedDish) {
  return ["calories", "protein", "carbohydrates", "fat"].every(
    (field) => Number.isFinite(Number(dish[field as keyof RecommendedDish])),
  );
}

// ─── Dish recommendation card ─────────────────────────────────────────────────

function MacroPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--se-radius-full)",
        background: "var(--se-bg-subtle)",
        color,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
      }}
    >
      {value}
      <span style={{ color: "var(--se-text-muted)", fontWeight: 700 }}>{label}</span>
    </span>
  );
}

function DishRecommendationCard({
  dish,
  onView,
  onAdd,
}: {
  dish: RecommendedDish;
  onView: () => void;
  onAdd?: () => void;
}) {
  const hall = getDishHall(dish);
  const canAdd = Boolean(onAdd && hall && hasDishNutrition(dish));

  return (
    <div
      style={{
        width: "100%",
        background: "var(--se-bg-elevated)",
        border: "1px solid var(--se-border)",
        borderRadius: 8,
        padding: "10px 12px",
        marginTop: 8,
        transition: "border-color 0.1s, background 0.1s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--se-border-strong)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--se-border)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: "var(--se-text-main)",
              margin: "0 0 3px",
            }}
          >
            {dish.quantity && dish.quantity > 1 ? `${dish.quantity}x ` : ""}
            {dish.dish_name}
          </p>
          {(hall || dish.serving_size) && (
            <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: "0 0 7px" }}>
              {[dish.serving_size, hall].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onView}
          aria-label={`View ${dish.dish_name}`}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "1px solid var(--se-border)",
            background: "var(--se-bg-surface)",
            color: "var(--se-text-secondary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      {hasDishNutrition(dish) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
          <MacroPill label="kcal" value={Number(dish.calories) || 0} color="var(--se-primary)" />
          <MacroPill label="P" value={Number(dish.protein) || 0} color="var(--se-macro-protein)" />
          <MacroPill label="C" value={Number(dish.carbohydrates) || 0} color="var(--se-macro-carbs)" />
          <MacroPill label="F" value={Number(dish.fat) || 0} color="var(--se-macro-fat)" />
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--se-text-muted)", margin: "8px 0 0" }}>
        {dish.reason}
      </p>

      {canAdd && (
        <button
          type="button"
          onClick={onAdd}
          style={{
            marginTop: 10,
            width: "100%",
            height: 34,
            borderRadius: "var(--se-radius-full)",
            border: "none",
            background: "var(--se-text-main)",
            color: "var(--se-text-inverted)",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          Add to tray
        </button>
      )}
    </div>
  );
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

const THINKING_STATES = [
  "Reading your goals",
  "Checking menu macros",
  "Filtering weak matches",
  "Building a tray",
] as const;

function ThinkingIndicator() {
  const [stateIndex, setStateIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStateIndex((prev) => (prev + 1) % THINKING_STATES.length);
    }, 1300);
    return () => window.clearInterval(timer);
  }, []);

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
          color: "var(--se-primary)",
          fontWeight: 900,
          animation: "ai-thinking-pulse 1.6s ease-in-out infinite",
        }}
      >
        ✦
      </div>
      <div
        style={{
          background: "var(--se-bg-surface)",
          border: "1px solid var(--se-border)",
          borderRadius: "18px 18px 18px 4px",
          padding: "11px 14px",
          minWidth: 210,
          boxShadow: "var(--se-shadow-sm)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 2,
            background: "linear-gradient(90deg, transparent, var(--se-primary), transparent)",
            animation: "ai-thinking-sweep 1.4s ease-in-out infinite",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "var(--se-success)",
              boxShadow: "0 0 0 4px rgba(34, 197, 94, 0.12)",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--se-text-secondary)" }}>
            {THINKING_STATES[stateIndex]}
          </span>
        </div>
        <div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 8 }}>
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
    </div>
  );
}

function FormattedMessageText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {bulletBuffer.map((line) => (
          <li key={line} style={{ marginTop: 4 }}>{line.replace(/^[-*]\s*/, "")}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((line) => {
    if (/^[-*]\s+/.test(line)) {
      bulletBuffer.push(line);
      return;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: blocks.length === 0 ? 0 : "8px 0 0" }}>
        {line}
      </p>,
    );
  });
  flushBullets();

  return <>{blocks}</>;
}

function MealPlanCard({
  plan,
  onAddPlan,
  onAddDish,
  onViewDish,
}: {
  plan: MealPlan;
  onAddPlan: () => void;
  onAddDish: (dish: RecommendedDish) => void;
  onViewDish: (dishId: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        border: "1px solid var(--se-border)",
        borderRadius: 8,
        background: "var(--se-bg-elevated)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "12px 12px 10px", borderBottom: "1px solid var(--se-border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: "var(--se-text-main)" }}>
              {plan.title}
            </p>
            {plan.summary && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--se-text-muted)" }}>
                {plan.summary}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onAddPlan}
            style={{
              border: "none",
              borderRadius: "var(--se-radius-full)",
              background: "var(--se-primary)",
              color: "white",
              fontSize: 12,
              fontWeight: 900,
              padding: "8px 12px",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {plan.action_label || "Add plan"}
          </button>
        </div>

        {plan.totals && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <MacroPill label="kcal" value={plan.totals.calories} color="var(--se-primary)" />
            <MacroPill label="P" value={plan.totals.protein} color="var(--se-macro-protein)" />
            <MacroPill label="C" value={plan.totals.carbohydrates} color="var(--se-macro-carbs)" />
            <MacroPill label="F" value={plan.totals.fat} color="var(--se-macro-fat)" />
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {plan.items.map((dish) => (
          <div
            key={`${dish.dish_id}-${dish.quantity || 1}`}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 10,
              padding: "10px 12px",
              borderBottom: "1px solid var(--se-border)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--se-text-main)" }}>
                {dish.quantity && dish.quantity > 1 ? `${dish.quantity}x ` : ""}
                {dish.dish_name}
              </p>
              <p style={{ margin: "3px 0 0", fontSize: 11, color: "var(--se-text-faint)" }}>
                {[dish.serving_size, getDishHall(dish)].filter(Boolean).join(" · ")}
              </p>
              {hasDishNutrition(dish) && (
                <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--se-text-muted)" }}>
                  {dish.calories} kcal · {dish.protein}g P · {dish.carbohydrates}g C · {dish.fat}g F
                </p>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => onAddDish(dish)}
                aria-label={`Add ${dish.dish_name} to tray`}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: "none",
                  background: "var(--se-text-main)",
                  color: "var(--se-text-inverted)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onViewDish(dish.dish_id)}
                aria-label={`View ${dish.dish_name}`}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  border: "1px solid var(--se-border)",
                  background: "var(--se-bg-surface)",
                  color: "var(--se-text-secondary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {plan.remaining_after && (
        <p style={{ margin: "10px 12px 0", fontSize: 11, color: "var(--se-text-muted)" }}>
          After this: {plan.remaining_after.calories} kcal, {plan.remaining_after.protein}g protein,{" "}
          {plan.remaining_after.carbohydrates}g carbs, {plan.remaining_after.fat}g fat remaining.
        </p>
      )}
      {plan.note && (
        <p style={{ margin: "6px 12px 12px", fontSize: 11, color: "var(--se-text-faint)" }}>
          {plan.note}
        </p>
      )}
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
  const toast = useToast();
  const {
    items: trayItems,
    totals: trayTotals,
    count: trayCount,
    uniqueCount,
    addItem,
  } = useMealTray();
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dailyIntake, setDailyIntake] = useState<DailyIntake | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  const suggestions = useMemo(() => pickRandom(ALL_PROMPTS, 3), []);

  // Route-scoped scroll lock so the AI chat behaves like modern chat UIs:
  // the shell owns scrolling, not the whole page (prevents reaching footer).
  useEffect(() => {
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, []);

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
              ? sanitizeRecommendedDishes(item.recommendedDishes)
              : undefined,
            mealPlan: sanitizeMealPlan(item.mealPlan),
            followUpSuggestions: sanitizeFollowUpSuggestions(item.followUpSuggestions),
            error: Boolean(item.error),
          };
        })
        .filter((item) => item.id > 0 && item.text.trim().length > 0)
        .map((item) => ({
          ...item,
          recommendedDishes: Array.isArray(item.recommendedDishes)
            ? sanitizeRecommendedDishes(item.recommendedDishes)
            : undefined,
          mealPlan: sanitizeMealPlan(item.mealPlan),
          followUpSuggestions: sanitizeFollowUpSuggestions(item.followUpSuggestions),
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
    const token = localStorage.getItem("authToken");
    if (!token) {
      setDailyIntake(null);
      return;
    }

    let cancelled = false;
    axios
      .get<DailyIntake>(`${API_BASE}/daily-intake/`, {
        headers: { Authorization: `Token ${token}` },
      })
      .then((res) => {
        if (!cancelled) {
          setDailyIntake(res.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDailyIntake(null);
        }
      });

    return () => {
      cancelled = true;
    };
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

  const trayContext = useMemo(() => ({
    item_count: trayCount,
    unique_dishes: uniqueCount,
    totals: trayTotals,
    items: trayItems.slice(0, 8).map((item) => ({
      dish_id: item.dish_id,
      dish_name: item.dish_name,
      hall: item.hall,
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      carbohydrates: item.carbohydrates,
      fat: item.fat,
      serving_size: item.serving_size,
    })),
  }), [trayCount, trayItems, trayTotals, uniqueCount]);

  const remainingSummary = useMemo(() => {
    if (!dailyIntake?.goals_set || !dailyIntake.goals) {
      return null;
    }

    return {
      calories: Math.max(0, dailyIntake.goals.calories - dailyIntake.consumed.calories),
      protein: Math.max(0, dailyIntake.goals.protein - dailyIntake.consumed.protein),
      carbs: Math.max(0, dailyIntake.goals.carbs - dailyIntake.consumed.carbs),
      fat: Math.max(0, dailyIntake.goals.fat - dailyIntake.consumed.fat),
    };
  }, [dailyIntake]);

  const viewDish = (dishId: number) => {
    navigate(`/dishes/${dishId}`, {
      state: { from: "/aimeals" },
    });
  };

  const addDishToTray = (dish: RecommendedDish, notify = true, fallbackToView = true) => {
    const hall = getDishHall(dish);
    if (!hall || !hasDishNutrition(dish)) {
      if (fallbackToView) {
        viewDish(dish.dish_id);
      }
      return 0;
    }

    const quantity = Math.max(1, Math.round(Number(dish.quantity) || 1));
    addItem({
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      hall,
      calories: Number(dish.calories) || 0,
      protein: Number(dish.protein) || 0,
      carbohydrates: Number(dish.carbohydrates) || 0,
      fat: Number(dish.fat) || 0,
      serving_size: dish.serving_size,
    }, quantity);

    if (notify) {
      toast.success(
        quantity > 1
          ? `${quantity} servings of ${dish.dish_name} added to your tray.`
          : `${dish.dish_name} added to your tray.`,
      );
    }

    return quantity;
  };

  const addMealPlanToTray = (plan: MealPlan) => {
    const addedServings = plan.items.reduce(
      (count, dish) => count + addDishToTray(dish, false, false),
      0,
    );

    if (addedServings > 0) {
      toast.success(`${addedServings} planned serving${addedServings === 1 ? "" : "s"} added to your tray.`);
    } else {
      toast.info("Open a dish first to add it to your tray.");
    }
  };

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
        tray_context: trayContext,
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
          recommendedDishes: sanitizeRecommendedDishes(data.recommended_dishes),
          mealPlan: sanitizeMealPlan(data.meal_plan),
          followUpSuggestions: sanitizeFollowUpSuggestions(data.follow_up_suggestions),
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

        @keyframes ai-thinking-pulse {
          0%, 100% { transform: scale(1); opacity: 0.82; }
          50%      { transform: scale(1.08); opacity: 1; }
        }

        @keyframes ai-thinking-sweep {
          0%   { transform: translateX(-100%); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }

        /* Remove browser/Tailwind focus rings on the AI chatbox only */
        .ai-chatbox-input:focus,
        .ai-chatbox-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
        }

        .ai-chatbox-form:focus,
        .ai-chatbox-form:focus-visible,
        .ai-chatbox-form:focus-within {
          outline: none !important;
          box-shadow: 0 4px 14px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04) !important;
        }
      `}</style>

      <div
        style={{
          position: "fixed",
          top: 76,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: "var(--se-bg-base)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 16px",
            minHeight: 0,
            overflow: "hidden",
          }}
        >
        {/* ── Tab bar ──────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            paddingBottom: 16,
            flexShrink: 0,
            flexWrap: "wrap",
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

          {activeTab === "chat" && !isEmpty && (
            <button
              type="button"
              onClick={() => {
                setMessages([]);
                nextId.current = 1;
                sessionStorage.removeItem(CHAT_STORAGE_KEY);
              }}
              style={{
                border: "1px solid var(--se-border)",
                background: "var(--se-bg-surface)",
                color: "var(--se-text-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: "8px 12px",
                borderRadius: "var(--se-radius-full)",
                boxShadow: "var(--se-shadow-sm)",
              }}
            >
              New chat
            </button>
          )}
        </div>

        {/* ── Estimator tab ──────────────────────────────────── */}
        {activeTab === "estimator" ? (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 16px" }}>
            <NutritionEstimator />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            {/* ── Chat messages area (ONLY scroll region) ───────────────── */}
            <div
              ref={messagesContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
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
                        <FormattedMessageText text={msg.text} />
                        {msg.mealPlan ? (
                          <MealPlanCard
                            plan={msg.mealPlan}
                            onAddPlan={() => addMealPlanToTray(msg.mealPlan as MealPlan)}
                            onAddDish={(dish) => addDishToTray(dish)}
                            onViewDish={viewDish}
                          />
                        ) : (
                          msg.recommendedDishes?.map((dish) => (
                            <DishRecommendationCard
                              key={dish.dish_id}
                              dish={dish}
                              onView={() => viewDish(dish.dish_id)}
                              onAdd={() => addDishToTray(dish)}
                            />
                          ))
                        )}
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

                  {loading && <ThinkingIndicator />}
                </div>
              )}
            </div>

            {/* ── Composer (pinned bottom, non-scrolling) ───────────────── */}
            <div
              style={{
                flexShrink: 0,
                paddingTop: 12,
                paddingBottom: 12,
                background: "var(--se-bg-base)",
              }}
            >
              <form
                onSubmit={handleSubmit}
                className="ai-chatbox-form"
                style={{
                  background: "var(--se-bg-surface)",
                  border: "1px solid var(--se-border)",
                  borderRadius: 22,
                  padding: "14px 16px 10px",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)",
                  transition: "border-color 150ms ease, box-shadow 150ms ease",
                  outline: "none",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask about dining halls, dishes, or nutrition…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  className="ai-chatbox-input"
                  style={{
                    width: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: 14,
                    color: "var(--se-text-main)",
                    padding: "4px 0 10px",
                  }}
                  onFocus={(e) => {
                    const form = e.currentTarget.form;
                    if (form) form.style.borderColor = "var(--se-border-strong)";
                  }}
                  onBlur={(e) => {
                    const form = e.currentTarget.form;
                    if (form) form.style.borderColor = "var(--se-border)";
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      color: "var(--se-text-faint)",
                    }}
                  >
                    {[
                      { d: "M12 5v14M5 12h14", label: "Add" },
                      { d: "M9 11.5V14a2 2 0 0 0 4 0V8a4 4 0 0 0-8 0v8a6 6 0 0 0 12 0V9", label: "Attach" },
                      { d: "M4 4h16v6H4zM4 14h16v6H4z", label: "Saved" },
                    ].map((icon) => (
                      <button
                        key={icon.label}
                        type="button"
                        aria-label={icon.label}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: "50%",
                          border: "none",
                          background: "transparent",
                          color: "var(--se-text-faint)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          transition: "background 0.15s, color 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--se-bg-elevated)";
                          e.currentTarget.style.color = "var(--se-text-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "var(--se-text-faint)";
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={icon.d} />
                        </svg>
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "7px 14px 7px 16px",
                      borderRadius: "9999px",
                      border: "none",
                      background:
                        input.trim() && !loading
                          ? "var(--se-text-main)"
                          : "var(--se-bg-subtle)",
                      color:
                        input.trim() && !loading
                          ? "var(--se-text-inverted)"
                          : "var(--se-text-faint)",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: input.trim() && !loading ? "pointer" : "default",
                      transition: "all 0.15s",
                    }}
                    aria-label="Send"
                  >
                    Send
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </form>

              {/* AI Context strip */}
              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--se-text-muted)",
                  fontWeight: 600,
                }}
              >
                <span>
                  Logged today:{" "}
                  <strong style={{ color: "var(--se-text-secondary)" }}>
                    {dailyIntake ? `${dailyIntake.consumed.calories} kcal` : "sign in"}
                  </strong>
                </span>
                <span style={{ color: "var(--se-text-faint)" }}>·</span>
                <span>
                  Tray:{" "}
                  <strong style={{ color: "var(--se-text-secondary)" }}>
                    {trayCount === 0 ? "empty" : `${trayCount} item${trayCount === 1 ? "" : "s"}`}
                  </strong>
                </span>
                {remainingSummary && (
                  <>
                    <span style={{ color: "var(--se-text-faint)" }}>·</span>
                    <span style={{ color: "var(--se-primary)", fontWeight: 700 }}>
                      Remaining: {remainingSummary.calories} kcal
                    </span>
                  </>
                )}
              </div>

            </div>
          </div>
        )}
        </div>
      </div>
    </>
  );
}
