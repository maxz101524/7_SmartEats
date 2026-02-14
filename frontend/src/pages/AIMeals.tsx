import { useState } from "react";

interface MealResult {
  meal_id: number;
  meal_name: string;
  total_nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  dishes_contained: { name: string; weight: number }[];
}

export default function AIMeals() {
  const [dishInput, setDishInput] = useState("");
  const [selectedDishes, setSelectedDishes] = useState<string[]>([]);
  const [results, setResults] = useState<MealResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"GET" | "POST">("GET");
  const [responseMode, setResponseMode] = useState("");

  // Add dish to list
  const addDish = (e: React.FormEvent) => {
    e.preventDefault();
    if (dishInput.trim() && !selectedDishes.includes(dishInput.trim())) {
      setSelectedDishes([...selectedDishes, dishInput.trim()]);
      setDishInput("");
    }
  };

  // Search using either GET (fuzzy, query params visible in URL) or POST (exact match, data hidden from URL)
  const handleSearch = async () => {
    if (selectedDishes.length === 0) return;

    setLoading(true);
    try {
      const query = selectedDishes.join(",");
      let response;

      if (searchMode === "GET") {
        // GET: fuzzy search — query params visible in URL, results shareable via link
        response = await fetch(
          `http://localhost:8000/api/aimeals/?dishes=${query}`,
        );
      } else {
        // POST: exact match — search data hidden from URL, useful when you don't want to expose query
        const formData = new FormData();
        formData.append("dishes", query);
        response = await fetch("http://localhost:8000/api/aimeals/", {
          method: "POST",
          body: formData,
        });
      }

      const data = await response.json();
      setResults(data.results);
      setResponseMode(data.mode);
    } catch (error) {
      console.error("Search failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">AI Meal Matcher</h1>

      {/* Input Section */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <form onSubmit={addDish} className="flex gap-2 mb-4">
          <input
            className="flex-grow px-4 py-2 border rounded-xl focus:ring-2 ring-blue-400 outline-none"
            placeholder="Type a dish name (e.g., Chicken)"
            value={dishInput}
            onChange={(e) => setDishInput(e.target.value)}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded-xl"
          >
            Add
          </button>
        </form>

        {/* Selected Tags */}
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedDishes.map((d) => (
            <span
              key={d}
              className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium flex items-center"
            >
              {d}
              <button
                onClick={() =>
                  setSelectedDishes(selectedDishes.filter((x) => x !== d))
                }
                className="ml-2 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>

        {/* Search Mode Toggle: GET (fuzzy, shareable URL) vs POST (exact match, hidden data) */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm font-medium text-gray-600">Search Mode:</span>
          <button
            onClick={() => setSearchMode("GET")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              searchMode === "GET"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Quick Search (GET)
          </button>
          <button
            onClick={() => setSearchMode("POST")}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
              searchMode === "POST"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Exact Match (POST)
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          {searchMode === "GET"
            ? "GET: Fuzzy search via URL query params — results are shareable via link."
            : "POST: Exact name match — search data is hidden from the URL."}
        </p>

        <button
          onClick={handleSearch}
          disabled={selectedDishes.length === 0 || loading}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {loading
            ? "Searching..."
            : `Find Meals with ${selectedDishes.length} Items`}
        </button>
      </div>

      {/* Results Section */}
      {responseMode && results.length > 0 && (
        <p className="text-sm text-gray-500 mb-2">
          Response from: <span className="font-semibold text-indigo-600">{responseMode}</span>
          {" "}— {results.length} result(s)
        </p>
      )}
      <div className="space-y-4">
        {results.map((meal) => (
          <div
            key={meal.meal_id}
            className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-2">
              {meal.meal_name}
            </h2>

            <div className="grid grid-cols-4 gap-2 mb-4">
              <NutrientBox
                label="Cals"
                value={meal.total_nutrition.calories}
                unit="kcal"
                color="bg-orange-50"
              />
              <NutrientBox
                label="Prot"
                value={meal.total_nutrition.protein}
                unit="g"
                color="bg-red-50"
              />
              <NutrientBox
                label="Carb"
                value={meal.total_nutrition.carbs}
                unit="g"
                color="bg-green-50"
              />
              <NutrientBox
                label="Fat"
                value={meal.total_nutrition.fat}
                unit="g"
                color="bg-yellow-50"
              />
            </div>

            <div className="text-sm text-gray-500 italic">
              Contains: {meal.dishes_contained.map((d) => d.name).join(", ")}
            </div>
          </div>
        ))}
        {results.length === 0 && !loading && selectedDishes.length > 0 && (
          <p className="text-center text-gray-400">
            No meals found containing ALL these items.
          </p>
        )}
      </div>
    </div>
  );
}

function NutrientBox({ label, value, unit, color }: any) {
  return (
    <div className={`${color} p-2 rounded-lg text-center`}>
      <div className="text-[10px] uppercase font-bold text-gray-500">
        {label}
      </div>
      <div className="text-sm font-bold">
        {value}
        {unit}
      </div>
    </div>
  );
}
