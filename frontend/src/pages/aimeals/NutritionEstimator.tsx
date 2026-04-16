import { useState } from "react";
import axios from "axios";
import { API_BASE } from "../../config";

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

export function NutritionEstimator() {
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
