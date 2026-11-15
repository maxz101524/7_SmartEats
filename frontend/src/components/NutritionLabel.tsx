import "../styles/nutrition-label.css";

export interface NutritionLabelDish {
  dish_name: string;
  serving_size?: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number | null;
  sodium?: number | null;
}

const fmt = (n: number | null | undefined, unit: string) =>
  n === null || n === undefined ? "—" : `${Math.round(Number(n) * 10) / 10}${unit}`;

/**
 * A nutrition-facts style panel: thick rules, display-weight calories,
 * mono numbers. Used as the homepage hero object and on dish pages.
 */
export default function NutritionLabel({
  dish,
  footnote,
  compact = false,
}: {
  dish: NutritionLabelDish;
  footnote?: string;
  compact?: boolean;
}) {
  const rows: [string, string, string][] = [
    ["Protein", fmt(dish.protein, "g"), "var(--se-macro-protein)"],
    ["Total Carbohydrate", fmt(dish.carbohydrates, "g"), "var(--se-macro-carbs)"],
    ["Total Fat", fmt(dish.fat, "g"), "var(--se-macro-fat)"],
  ];
  if (!compact) {
    rows.push(["Dietary Fiber", fmt(dish.fiber, "g"), "var(--se-macro-fiber)"]);
    rows.push(["Sodium", fmt(dish.sodium, "mg"), "var(--se-text-faint)"]);
  }

  return (
    <div className={`nf-label${compact ? " nf-label--compact" : ""}`}>
      <div className="nf-label__title">Nutrition Facts</div>
      <div className="nf-label__dish">{dish.dish_name}</div>
      <div className="nf-label__serving">
        <span>Serving size</span>
        <span className="se-mono">{dish.serving_size || "1 serving"}</span>
      </div>
      <div className="nf-label__rule nf-label__rule--heavy" />
      <div className="nf-label__calories">
        <span>Calories</span>
        <span className="se-mono">{dish.calories}</span>
      </div>
      <div className="nf-label__rule nf-label__rule--medium" />
      {rows.map(([label, value, color]) => (
        <div className="nf-label__row" key={label}>
          <span>
            <i style={{ background: color }} aria-hidden="true" />
            {label}
          </span>
          <span className="se-mono">{value}</span>
        </div>
      ))}
      {footnote && <div className="nf-label__foot">{footnote}</div>}
    </div>
  );
}
