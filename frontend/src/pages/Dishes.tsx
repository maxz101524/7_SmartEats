import { useState } from "react";
import ShowData from "../components/ShowData";
import { useNavigate } from "react-router-dom";
import AddDish from "../components/AddDish";
export interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall__name: string;
  protein: string;
  carbohydrates: string;
  fat: string;
}

function Dishes() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [api, setApi] = useState("http://localhost:8000/api/dishes/");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = query
      ? `http://localhost:8000/api/dishes/?search=${query}`
      : `http://localhost:8000/api/dishes/`;

    setApi(url);
  };

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 mb-6">
          Menu Explorer
        </h1>

        <form
          onSubmit={handleSearchSubmit}
          className="flex flex-col sm:flex-row gap-3 max-w-2xl"
        >
          <div className="relative flex-grow">
            <input
              type="text"
              placeholder="Search by dish name (e.g. Pasta)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
          >
            Search
          </button>
        </form>
      </header>
      <ShowData<Dish>
        api={api}
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

            <button
              onClick={() => navigate(`/dishes/${dish.dish_id}`)}
              className="mt-4 w-full py-2 bg-gray-50 hover:bg-blue-600 hover:text-white text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-200 hover:border-blue-600"
            >
              View Details
            </button>
          </div>
        )}
      />

      <AddDish></AddDish>
    </>
  );
}

export default Dishes;
