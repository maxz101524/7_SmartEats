import { MacroPill } from "./MacroPill";
import { getDishHall, hasDishNutrition } from "./dishHelpers";
import type { RecommendedDish } from "./types";

export function DishRecommendationCard({
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
