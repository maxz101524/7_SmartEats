import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE, BACKEND_BASE } from "../config";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";
import Skeleton from "../components/Skeleton";

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall__name: string;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number;
  sodium?: number;
  allergens?: string[];
  dietary_flags?: string[];
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  course?: string;
  nutrition_source?: string;
  ai_confidence?: string;
}

function MacroCard({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | string;
  unit: string;
  color: string;
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 80,
        background: "var(--se-bg-surface)",
        border: "1px solid var(--se-border)",
        borderRadius: "var(--se-radius-lg)",
        padding: "14px 8px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--se-text-faint)",
          margin: "0 0 4px",
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 800,
          color,
          margin: "0 0 2px",
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: "var(--se-text-muted)", margin: 0 }}>{unit}</p>
    </div>
  );
}

function DishDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [dish, setDish] = useState<Dish | null>(null);

  useEffect(() => {
    axios.get(`${API_BASE}/dishes/${id}`).then((res) => setDish(res.data));
  }, [id]);

  if (!dish) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "var(--se-space-8)" }}>
        <Skeleton variant="rect" height={32} width="60%" />
        <div style={{ marginTop: 16 }}><Skeleton variant="text" lines={2} /></div>
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rect" height={80} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 48px" }}>
      {/* Back button */}
      <button
        onClick={() => {
          const from = location.state?.from;
          if (typeof from === "string" && from.startsWith("/")) {
            navigate(from);
            return;
          }
          navigate(-1);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 600,
          color: "var(--se-text-muted)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginBottom: 20,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      {/* Dish name */}
      <h1
        style={{
          fontSize: "var(--se-text-h1)",
          fontWeight: "var(--se-weight-extrabold)",
          color: "var(--se-text-main)",
          margin: "0 0 6px",
          lineHeight: 1.2,
        }}
      >
        {dish.dish_name}
      </h1>

      {/* Subtitle: station + hall */}
      <p style={{ fontSize: 14, color: "var(--se-text-muted)", margin: "0 0 4px" }}>
        {[dish.serving_unit, dish.dining_hall__name].filter(Boolean).join(" · ")}
      </p>

      {/* Serving size */}
      {dish.serving_size && (
        <p style={{ fontSize: 13, color: "var(--se-text-secondary)", margin: "0 0 8px", fontWeight: 500 }}>
          Serving: {dish.serving_size}
        </p>
      )}

      {/* Dietary flags */}
      {dish.dietary_flags && dish.dietary_flags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {dish.dietary_flags.map((flag) => {
            const colors = FLAG_COLORS[flag] || FLAG_FALLBACK;
            return (
              <span
                key={flag}
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  background: colors.bg,
                  color: colors.text,
                }}
              >
                {flag}
              </span>
            );
          })}
        </div>
      )}

      {/* Allergen warnings */}
      {dish.allergens && dish.allergens.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {dish.allergens.map((allergen) => (
            <span
              key={allergen}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 9999,
                border: "1.5px solid var(--se-error)",
                color: "var(--se-error)",
                background: "var(--se-error-dim)",
              }}
            >
              {allergen}
            </span>
          ))}
        </div>
      )}

      {/* Primary macros — 4 cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <MacroCard label="Calories" value={dish.calories} unit="kcal" color="var(--se-macro-cal)" />
        <MacroCard label="Protein" value={dish.protein} unit="g" color="var(--se-macro-protein)" />
        <MacroCard label="Carbs" value={dish.carbohydrates} unit="g" color="var(--se-macro-carbs)" />
        <MacroCard label="Fat" value={dish.fat} unit="g" color="var(--se-macro-fat)" />
      </div>

      {/* Extended nutrition */}
      {(dish.fiber != null || dish.sodium != null) && (
        <div
          style={{
            background: "var(--se-bg-surface)",
            border: "1px solid var(--se-border)",
            borderRadius: "var(--se-radius-lg)",
            padding: "14px 18px",
            marginBottom: 16,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--se-text-faint)",
              margin: "0 0 10px",
            }}
          >
            Extended Nutrition
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {dish.fiber != null && (
              <div>
                <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: "0 0 2px" }}>Fiber</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--se-macro-fiber)", margin: 0 }}>
                  {dish.fiber}g
                </p>
              </div>
            )}
            {dish.sodium != null && (
              <div>
                <p style={{ fontSize: 11, color: "var(--se-text-faint)", margin: "0 0 2px" }}>Sodium</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--se-text-secondary)", margin: 0 }}>
                  {dish.sodium}mg
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Nutrition source badge */}
      {dish.nutrition_source && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 9999,
            background: dish.nutrition_source === "ai_generated" ? "var(--se-info-dim)" : "var(--se-bg-subtle)",
            color: dish.nutrition_source === "ai_generated" ? "var(--se-info)" : "var(--se-text-muted)",
            marginBottom: 20,
          }}
        >
          {dish.nutrition_source === "ai_generated" ? "AI Estimated" : "Database"}
          {dish.ai_confidence && (
            <span style={{ opacity: 0.7 }}>
              · {dish.ai_confidence} confidence
            </span>
          )}
        </div>
      )}

      {/* Pie chart */}
      <div
        style={{
          background: "var(--se-bg-surface)",
          border: "1px solid var(--se-border)",
          borderRadius: "var(--se-radius-lg)",
          padding: 16,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <img
          src={`${BACKEND_BASE}/api/dish-summary-img/${id}/`}
          alt="Macro Breakdown Chart"
          style={{ maxWidth: "100%", height: "auto" }}
        />
      </div>
    </div>
  );
}

export default DishDetail;
