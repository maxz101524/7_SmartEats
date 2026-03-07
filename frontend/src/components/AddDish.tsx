import { useState, useEffect } from "react";
import { API_BASE } from "../config";
import { Button } from "./Button";

const inputStyle: React.CSSProperties = {
  background: "var(--se-bg-input)",
  border: "1px solid var(--se-border)",
  borderRadius: "var(--se-radius-md)",
  padding: "10px 14px",
  fontSize: "var(--se-text-base)",
  color: "var(--se-text-main)",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--se-text-sm)",
  color: "var(--se-text-secondary)",
  fontWeight: 500,
  marginBottom: "8px",
};

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
      setMessage("error:Dish name is required");
      setLoading(false);
      return;
    }
    if (!category.trim()) {
      setMessage("error:Category is required");
      setLoading(false);
      return;
    }
    if (!diningHall) {
      setMessage("error:Dining hall is required");
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
        setName("");
        setCategory("");
        setCalories("");
        setProtein("");
        setCarbs("");
        setFat("");
        setDiningHall("");
        setMessage("success:Dish added successfully!");
      } else {
        const errorData = await response.json();
        console.error("Backend error:", errorData);
        setMessage(
          `error:${errorData.error || "Failed to add dish"}`,
        );
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setMessage(`error:${error}`);
    } finally {
      setLoading(false);
    }
  };

  const isSuccess = message.startsWith("success:");
  const isError = message.startsWith("error:");
  const messageText = message.replace(/^(success|error):/, "");

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        background: "var(--se-bg-surface)",
        border: "1.5px solid var(--se-border)",
        borderRadius: "var(--se-radius-lg)",
        boxShadow: "var(--se-shadow-md)",
        padding: "var(--se-space-6)",
        marginTop: "var(--se-space-8)",
      }}
    >
      <h2
        style={{
          fontSize: "var(--se-text-h2)",
          fontWeight: "var(--se-weight-bold)" as any,
          marginBottom: "var(--se-space-6)",
          color: "var(--se-text-main)",
          borderBottom: "1px solid var(--se-border)",
          paddingBottom: "var(--se-space-3)",
        }}
      >
        Add New Dish
      </h2>

      {message && (
        <p
          style={{
            marginBottom: "var(--se-space-4)",
            padding: "var(--se-space-3)",
            borderRadius: "var(--se-radius-md)",
            ...(isSuccess
              ? {
                  background: "var(--se-success-dim)",
                  color: "var(--se-success)",
                  border: "1px solid var(--se-success)",
                }
              : {
                  background: "var(--se-error-dim)",
                  color: "var(--se-error)",
                  border: "1px solid var(--se-error)",
                }),
          }}
        >
          {messageText}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label style={labelStyle}>Dish Name *</label>
          <input
            type="text"
            placeholder="Enter dish name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            required
          />
        </div>

        <div>
          <label style={labelStyle}>Category *</label>
          <input
            type="text"
            placeholder="e.g., Salad, Pasta, Main..."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={inputStyle}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label style={labelStyle}>Calories</label>
          <input
            type="number"
            placeholder="0"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            min="0"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Protein (g)</label>
          <input
            type="number"
            placeholder="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            min="0"
            style={inputStyle}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label style={labelStyle}>Carbohydrates (g)</label>
          <input
            type="number"
            placeholder="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            min="0"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={labelStyle}>Fat (g)</label>
          <input
            type="number"
            placeholder="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            min="0"
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ marginBottom: "var(--se-space-6)" }}>
        <label style={labelStyle}>Dining Hall *</label>

        {hallsError && (
          <div
            style={{
              background: "var(--se-error-dim)",
              color: "var(--se-error)",
              padding: "var(--se-space-3)",
              borderRadius: "var(--se-radius-md)",
              marginBottom: "var(--se-space-3)",
              border: "1px solid var(--se-error)",
            }}
          >
            Error loading dining halls: {hallsError}
          </div>
        )}

        {hallsLoading && (
          <div
            style={{
              background: "var(--se-warning-dim)",
              color: "var(--se-warning)",
              padding: "var(--se-space-3)",
              borderRadius: "var(--se-radius-md)",
              marginBottom: "var(--se-space-3)",
              border: "1px solid var(--se-warning)",
            }}
          >
            Loading dining halls...
          </div>
        )}

        {!hallsLoading && diningHalls.length === 0 && !hallsError && (
          <div
            style={{
              background: "var(--se-info-dim)",
              color: "var(--se-info)",
              padding: "var(--se-space-3)",
              borderRadius: "var(--se-radius-md)",
              marginBottom: "var(--se-space-3)",
              border: "1px solid var(--se-info)",
            }}
          >
            No dining halls available
          </div>
        )}

        <select
          value={diningHall}
          onChange={(e) => setDiningHall(e.target.value)}
          style={{
            ...inputStyle,
            ...(hallsLoading || hallsError !== null
              ? {
                  background: "var(--se-bg-subtle)",
                  cursor: "not-allowed",
                }
              : {}),
          }}
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

      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={loading}
        disabled={loading}
        className="w-full"
      >
        {loading ? "Adding..." : "Add Dish"}
      </Button>
    </form>
  );
}

export default AddDish;
