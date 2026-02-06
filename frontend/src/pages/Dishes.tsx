import DataList from "../components/DataList";

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall__name: string;
}

function Dishes() {
  return (
    <DataList<Dish>
      endpoint="http://localhost:8000/api/dishes/"
      title="Dishes"
      subtitle="Explore menu items across all dining halls"
      emptyTitle="No dishes found"
      emptyMessage="Menu items have not been added yet. Check back later."
      getKey={(dish) => dish.dish_id}
      renderCard={(dish) => (
        <>
          <div className="card-header">
            <h3 className="card-title">{dish.dish_name}</h3>
            <span className="card-badge">{dish.category}</span>
          </div>
          <p className="card-detail">
            <span className="card-label">Dining Hall:</span> {dish.dining_hall__name}
          </p>
          <p className="card-detail">
            <span className="card-label">Calories:</span> {dish.calories} kcal
          </p>
        </>
      )}
    />
  );
}

export default Dishes;
