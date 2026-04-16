import { MacroPill } from "./MacroPill";
import { getDishHall, hasDishNutrition } from "./dishHelpers";
import type { MealPlan, RecommendedDish } from "./types";

export function MealPlanCard({
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
