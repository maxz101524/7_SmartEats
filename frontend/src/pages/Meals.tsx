import DataList from "../components/DataList";

interface Meal {
  meal_id: number;
  total_calories: number;
  total_protein: number;
  total_carbohydrates: number;
  total_fat: number;
  user_id: string;
  date: string;
}

function Meals() {
  return (
    <DataList<Meal>
      endpoint="http://localhost:8000/api/meals/"
      title="Meal History"
      subtitle="Track logged meals and daily nutrition"
      emptyTitle="No meals logged"
      emptyMessage="No meals have been recorded yet. Start logging your meals to track nutrition!"
      getKey={(meal) => meal.meal_id}
      renderCard={(meal) => (
        <>
          <div className="card-header">
            <h3 className="card-title">Meal #{meal.meal_id}</h3>
            <span className="card-badge">{meal.date}</span>
          </div>
          <p className="card-detail">
            <span className="card-label">User:</span> {meal.user_id}
          </p>
          <div className="macro-grid">
            <div className="macro-item">
              <span className="macro-value">{meal.total_calories}</span>
              <span className="macro-label">Calories</span>
            </div>
            <div className="macro-item">
              <span className="macro-value">{meal.total_protein}g</span>
              <span className="macro-label">Protein</span>
            </div>
            <div className="macro-item">
              <span className="macro-value">{meal.total_carbohydrates}g</span>
              <span className="macro-label">Carbs</span>
            </div>
            <div className="macro-item">
              <span className="macro-value">{meal.total_fat}g</span>
              <span className="macro-label">Fat</span>
            </div>
          </div>
        </>
      )}
    />
  );
}

export default Meals;
