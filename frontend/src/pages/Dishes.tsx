import ShowData from "../components/ShowData";

interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall__name: string;
}

function Dishes() {
  return (
    <ShowData<Dish>
      api="http://localhost:8000/api/dishes/"
      title="Dishes"
      getKey={(dish) => dish.dish_id}
      renderCard={(dish) => (
        <div className="p-5 flex flex-col h-full">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-xl font-bold text-gray-800 leading-tight">
              {dish.dish_name}
            </h3>
            <span className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-blue-700 bg-blue-50 rounded-md border border-blue-100">
              {dish.category}
            </span>
          </div>

          <div className="space-y-2 mt-auto">
            <p className="text-sm text-gray-600 flex items-center">
              <span className="font-semibold text-gray-500 w-24">
                Dining Hall:
              </span>
              <span className="text-gray-900">{dish.dining_hall__name}</span>
            </p>

            <p className="text-sm text-gray-600 flex items-center">
              <span className="font-semibold text-gray-500 w-24">
                Calories:
              </span>
              <span
                className={`font-medium ${dish.calories > 500 ? "text-orange-600" : "text-green-600"}`}
              >
                {dish.calories} kcal
              </span>
            </p>
          </div>

          {/* <button className="mt-4 w-full py-2 bg-gray-50 hover:bg-blue-600 hover:text-white text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-200 hover:border-blue-600">
            View Details
          </button> */}
        </div>
      )}
    />
  );
}

export default Dishes;
