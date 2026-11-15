import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../config";
import { FLAG_COLORS, FLAG_FALLBACK } from "../utils/flagColors";
import Skeleton from "../components/Skeleton";
import { useToast } from "../components/useToast";
import { MealTrayCard } from "../components/MealTrayCard";
import NutritionLabel from "../components/NutritionLabel";
import { IconArrowLeft, IconPlus } from "../components/Icons";
import { useMealTray } from "../mealTray";
import "../styles/detail.css";

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall?: number;
  dining_hall__name: string;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber?: number | null;
  sodium?: number | null;
  allergens?: string[];
  dietary_flags?: string[];
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  course?: string;
  nutrition_source?: string;
  ai_confidence?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  ai_generated: "Estimated with Gemini from the dish name, station and allergen data",
  copied: "Copied from the same dish served at another hall",
  wger: "Matched against the Wger nutrition database",
};

function EnergySplit({ dish }: { dish: Dish }) {
  const parts = [
    { label: "Protein", kcal: dish.protein * 4, grams: dish.protein, color: "var(--se-macro-protein)" },
    { label: "Carbs", kcal: dish.carbohydrates * 4, grams: dish.carbohydrates, color: "var(--se-macro-carbs)" },
    { label: "Fat", kcal: dish.fat * 9, grams: dish.fat, color: "var(--se-macro-fat)" },
  ];
  const total = parts.reduce((s, p) => s + p.kcal, 0);
  if (!total) return <p className="dish-muted">No macro breakdown is available for this dish.</p>;

  return (
    <div className="dish-split">
      <div className="dish-split__bar" role="img" aria-label="Share of calories from protein, carbs and fat">
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${(p.kcal / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="dish-split__legend">
        {parts.map((p) => (
          <div key={p.label}>
            <span className="dish-split__swatch" style={{ background: p.color }} />
            <span className="dish-split__label">{p.label}</span>
            <span className="se-mono dish-split__pct">{Math.round((p.kcal / total) * 100)}%</span>
            <span className="se-mono dish-split__grams">{p.grams}g</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DishDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [dish, setDish] = useState<Dish | null>(null);
  const [related, setRelated] = useState<{ forId: number; items: Dish[] }>({ forId: -1, items: [] });
  const toast = useToast();
  const { addItem, getItemQuantity } = useMealTray();

  useEffect(() => {
    axios.get(`${API_BASE}/dishes/${id}`).then((res) => setDish(res.data));
  }, [id]);

  useEffect(() => {
    if (!dish?.dining_hall) return;
    axios
      .get(`${API_BASE}/dishes/`, { params: { hall_id: dish.dining_hall } })
      .then((res) => {
        const list: Dish[] = Array.isArray(res.data) ? res.data : [];
        setRelated({
          forId: dish.dish_id,
          items: list
            .filter((d) => d.dish_id !== dish.dish_id && d.serving_unit === dish.serving_unit)
            .slice(0, 5),
        });
      })
      .catch(() => setRelated({ forId: dish.dish_id, items: [] }));
  }, [dish]);

  function handleAddToMeal() {
    if (!dish) return;
    const result = addItem({
      dish_id: dish.dish_id,
      dish_name: dish.dish_name,
      hall: dish.dining_hall__name,
      calories: dish.calories,
      protein: dish.protein,
      carbohydrates: dish.carbohydrates,
      fat: dish.fat,
      serving_size: dish.serving_size,
    });
    const nextQuantity = result.items.find((item) => item.dish_id === dish.dish_id)?.quantity || 1;
    if (result.added || nextQuantity === 1) toast.success(`${dish.dish_name} added to your tray.`);
    else toast.info(`${dish.dish_name} now has ${nextQuantity} servings in your tray.`);
  }

  const goBack = () => {
    const from = location.state?.from;
    if (typeof from === "string" && from.startsWith("/")) navigate(from);
    else if (window.history.length > 1) navigate(-1);
    else navigate("/menu");
  };

  // Show the skeleton until the dish for the current URL has loaded.
  if (!dish || String(dish.dish_id) !== id) {
    return (
      <div className="dish-page">
        <div className="dish-grid">
          <div>
            <Skeleton variant="rect" height={18} width="30%" />
            <div style={{ marginTop: 16 }}><Skeleton variant="rect" height={56} width="80%" /></div>
            <div style={{ marginTop: 16 }}><Skeleton variant="rect" height={120} /></div>
          </div>
          <Skeleton variant="rect" height={380} />
        </div>
      </div>
    );
  }

  const dishQuantity = getItemQuantity(dish.dish_id);
  const relatedItems = related.forId === dish.dish_id ? related.items : [];
  const context = [dish.dining_hall__name, dish.serving_unit, dish.meal_period].filter(Boolean);

  return (
    <div className="dish-page">
      <button type="button" className="dish-back" onClick={goBack}>
        <IconArrowLeft size={15} />
        Back
      </button>

      <div className="dish-grid">
        <div className="dish-main">
          <p className="se-eyebrow dish-context">{context.join(" · ")}</p>
          <h1 className="dish-title">{dish.dish_name}</h1>
          <p className="dish-serving">
            <span className="se-mono">{dish.calories}</span> kcal per {dish.serving_size || "serving"}
          </p>

          {(dish.dietary_flags?.length || dish.allergens?.length) ? (
            <dl className="dish-facts">
              {dish.dietary_flags && dish.dietary_flags.length > 0 && (
                <div>
                  <dt className="se-eyebrow">Suitable for</dt>
                  <dd>
                    {dish.dietary_flags.map((flag) => {
                      const colors = FLAG_COLORS[flag] || FLAG_FALLBACK;
                      return (
                        <span key={flag} className="dish-tag" style={{ background: colors.bg, color: colors.text }}>
                          {flag}
                        </span>
                      );
                    })}
                  </dd>
                </div>
              )}
              {dish.allergens && dish.allergens.length > 0 && (
                <div>
                  <dt className="se-eyebrow">Contains</dt>
                  <dd>
                    {dish.allergens.map((allergen) => (
                      <span key={allergen} className="dish-tag dish-tag--allergen">
                        {allergen}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          ) : null}

          <section className="dish-block">
            <h2 className="dish-block__title">Where the calories come from</h2>
            <EnergySplit dish={dish} />
          </section>

          <div className="dish-actions">
            <button
              type="button"
              className={`dish-add${dishQuantity > 0 ? " is-secondary" : ""}`}
              onClick={handleAddToMeal}
            >
              <IconPlus size={17} />
              {dishQuantity > 0 ? "Add Another Serving" : "Add to Meal Tray"}
            </button>
            {dishQuantity > 0 && (
              <p className="dish-muted">
                {dishQuantity} serving{dishQuantity === 1 ? "" : "s"} currently in your tray.
              </p>
            )}
          </div>

          {dish.nutrition_source && (
            <p className="dish-source">
              <span className="se-eyebrow">Source</span>
              {SOURCE_LABELS[dish.nutrition_source] ?? "From the SmartEats dish database"}
              {dish.ai_confidence ? ` (${dish.ai_confidence} confidence)` : ""}. Treat values as estimates.
            </p>
          )}
        </div>

        <aside className="dish-aside">
          <NutritionLabel dish={dish} />
        </aside>
      </div>

      {relatedItems.length > 0 && (
        <section className="dish-related">
          <h2 className="dish-block__title">More from {dish.serving_unit}</h2>
          <div className="dish-related__list">
            {relatedItems.map((d) => (
              <Link key={d.dish_id} to={`/dishes/${d.dish_id}`} className="dish-related__row">
                <span className="dish-related__name">{d.dish_name}</span>
                <span className="se-mono dish-related__macros">
                  {d.calories} kcal · {d.protein}g protein
                </span>
                <span aria-hidden="true" className="dish-related__arrow">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="dish-tray">
        <MealTrayCard compact />
      </section>
    </div>
  );
}

export default DishDetail;
