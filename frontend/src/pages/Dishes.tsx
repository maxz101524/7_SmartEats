import { useState, useEffect } from "react";
import ShowData from "../components/ShowData";
import { useNavigate } from "react-router-dom";
// import AddDish from "../components/AddDish";
import axios from "axios";
import { API_BASE } from "../config";
export interface Dish {
  dish_id: number;
  dish_name: string;
  calories: number;
  category: string;
  dining_hall__name: string;
  protein: string;
  carbohydrates: string;
  fat: string;
  detail_url: string; // from model's get_absolute_url()
}

interface DishStats {
  total_dishes: number;
  total_halls: number;
  dishes_by_category: { category: string; count: number }[];
  dishes_by_hall: { dining_hall__name: string; count: number }[];
}

function Dishes() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [api, setApi] = useState(`${API_BASE}/dishes/`);
  const [stats, setStats] = useState<DishStats | null>(null);

  // Fetch aggregation stats (count + grouped summaries)
  useEffect(() => {
    axios
      .get(`${API_BASE}/dish-stats/`)
      .then((res) => setStats(res.data))
      .catch((err) => console.error("Failed to load stats:", err));
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const url = query
      ? `${API_BASE}/dishes/?search=${query}`
      : `${API_BASE}/dishes/`;

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

      {/* Aggregation Summaries — ORM count + grouped annotate results */}
      {stats && (
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Total counts */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Totals
            </h3>
            <p className="text-3xl font-bold text-gray-900">
              {stats.total_dishes}{" "}
              <span className="text-base font-normal text-gray-500">
                dishes
              </span>
            </p>
            <p className="text-lg font-semibold text-gray-600 mt-1">
              {stats.total_halls}{" "}
              <span className="text-sm font-normal text-gray-500">
                dining halls
              </span>
            </p>
          </div>

          {/* Dishes per category (grouped summary) */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              By Category
            </h3>
            {stats.dishes_by_category.length === 0 ? (
              <p className="text-gray-400 text-sm">No categories found.</p>
            ) : (
              <ul className="space-y-1">
                {stats.dishes_by_category.map((cat) => (
                  <li
                    key={cat.category}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-gray-700">
                      {cat.category || "Uncategorized"}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {cat.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Dishes per dining hall (grouped summary) */}
          <div className="bg-white rounded-xl shadow-sm border p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              By Dining Hall
            </h3>
            {stats.dishes_by_hall.length === 0 ? (
              <p className="text-gray-400 text-sm">No dining halls found.</p>
            ) : (
              <ul className="space-y-1">
                {stats.dishes_by_hall.map((hall) => (
                  <li
                    key={hall.dining_hall__name}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-gray-700">
                      {hall.dining_hall__name}
                    </span>
                    <span className="font-semibold text-gray-900">
                      {hall.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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

            {/* Uses model-driven URL from get_absolute_url() instead of manually building the path */}
            <button
              onClick={() =>
                navigate(`/dishes/${dish.dish_id}`, {
                  state: { detailUrl: dish.detail_url },
                })
              }
              className="mt-4 w-full py-2 bg-gray-50 hover:bg-blue-600 hover:text-white text-gray-700 text-sm font-medium rounded-lg transition-colors border border-gray-200 hover:border-blue-600"
            >
              View Details
            </button>
          </div>
        )}
      />

      {/* <AddDish></AddDish> */}
    </>
  );
}

export default Dishes;
