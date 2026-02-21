import { useState, useEffect } from "react";
import { API_BASE } from "../config";

function AddDish() {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [diningHall, setDiningHall] = useState("");
  const [diningHalls, setDiningHalls] = useState<any[]>([]);
  const [hallsLoading, setHallsLoading] = useState(true);
  const [hallsError, setHallsError] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/dishes-manage/`, {
      method: "GET",
      credentials: "include",
    })
      .then(() => {
        const token = getCookie("csrftoken");
        setCsrfToken(token || "");
      })
      .catch((error) => console.error("Error fetching CSRF token:", error));

    // Fetch dining halls for dropdown
    fetch(`${API_BASE}/halls/`, {
      method: "GET",
      credentials: "include",
    })
      .then((response) => {
        console.log("Hall response status:", response.status);
        return response.json();
      })
      .then((data) => {
        console.log("Dining halls received:", data);
        setDiningHalls(data);
        setHallsLoading(false);
        setHallsError(null);
      })
      .catch((error) => {
        console.error("Error fetching dining halls:", error);
        setHallsError(error.message);
        setHallsLoading(false);
      });
  }, []);

  const getCookie = (name: string) => {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        if (cookie.substring(0, name.length + 1) === name + "=") {
          cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
          break;
        }
      }
    }
    return cookieValue;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    // Validate form
    if (!name.trim()) {
      setMessage("❌ Dish name is required");
      setLoading(false);
      return;
    }
    if (!category.trim()) {
      setMessage("❌ Category is required");
      setLoading(false);
      return;
    }
    if (!diningHall) {
      setMessage("❌ Dining hall is required");
      setLoading(false);
      return;
    }

    try {
      const payload = {
        dish_name: name,
        category: category,
        calories: parseInt(calories) || 0,
        protein: parseInt(protein) || 0,
        carbohydrates: parseInt(carbs) || 0,
        fat: parseInt(fat) || 0,
        dining_hall: parseInt(diningHall),
      };

      console.log("Submitting payload:", payload);

      const response = await fetch(`${API_BASE}/dishes-manage/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setMessage("✅ Dish added successfully!");
        setName("");
        setCategory("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
        setDiningHall("");
        // Refresh page after 1.5 seconds to show success message
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        setMessage(`❌ Error: ${errorData.error || "Failed to add dish"}`);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setMessage(`❌ Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 border-2 border-blue-300 rounded-lg shadow-lg bg-white mt-8"
    >
      <h2 className="text-2xl font-bold mb-6 text-gray-800 border-b pb-3">
        ➕ Add New Dish
      </h2>

      {message && (
        <p
          className={`mb-4 p-3 rounded ${
            message.includes("✅")
              ? "bg-green-100 text-green-700 border border-green-300"
              : "bg-red-100 text-red-700 border border-red-300"
          }`}
        >
          {message}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Dish Name *
          </label>
          <input
            type="text"
            placeholder="Enter dish name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Category *
          </label>
          <input
            type="text"
            placeholder="e.g., Salad, Pasta, Main..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Calories
          </label>
          <input
            type="number"
            placeholder="0"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            min="0"
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Protein (g)
          </label>
          <input
            type="number"
            placeholder="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min="0"
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Carbohydrates (g)
          </label>
          <input
            type="number"
            placeholder="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            min="0"
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Fat (g)
          </label>
          <input
            type="number"
            placeholder="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            min="0"
            className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Dining Hall *
        </label>

        {hallsError && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-3 border border-red-300">
            ❌ Error loading dining halls: {hallsError}
          </div>
        )}

        {hallsLoading && (
          <div className="bg-yellow-100 text-yellow-700 p-3 rounded mb-3 border border-yellow-300">
            ⏳ Loading dining halls...
          </div>
        )}

        {!hallsLoading && diningHalls.length === 0 && !hallsError && (
          <div className="bg-blue-100 text-blue-700 p-3 rounded mb-3 border border-blue-300">
            ℹ️ No dining halls available
          </div>
        )}

        <select
          value={diningHall}
          onChange={(e) => setDiningHall(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
          disabled={hallsLoading || hallsError !== null}
          required
        >
          <option value="">
            {hallsLoading
              ? "Loading dining halls..."
              : "-- Select a Dining Hall --"}
          </option>
          {diningHalls.map((hall: any) => (
            <option key={hall.Dining_Hall_ID} value={hall.Dining_Hall_ID}>
              {hall.name}
              {hall.location ? ` (${hall.location})` : ""}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold py-3 rounded-lg transition-all"
      >
        {loading ? "Adding..." : "➕ Add Dish"}
      </button>
    </form>
  );
}

export default AddDish;
