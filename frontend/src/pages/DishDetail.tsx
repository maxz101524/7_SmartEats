import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import type { Dish } from "./Dishes";
import axios from "axios";

function DishDetail() {
  const { id } = useParams();
  const [dish, setDish] = useState<Dish | null>(null);
  useEffect(() => {
    axios
      .get(`http://localhost:8000/api/dishes/${id}`)
      .then((res) => setDish(res.data));
  }, [id]);

  if (!dish) {
    return <p>Loading...</p>;
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold">{dish.dish_name}</h1>
      <p className="text-xl text-blue-600">{dish.category}</p>
      <div className="mt-4 p-4 border rounded-lg">
        <p>
          <strong>Calories:</strong> {dish.calories} kcal
        </p>
        <p>
          <strong>Protein:</strong> {dish.protein} kcal
        </p>
        <p>
          <strong>Carbohydrates:</strong> {dish.carbohydrates} kcal
        </p>
        <p>
          <strong>Fat:</strong> {dish.fat} kcal
        </p>
        <p>
          <strong>Location:</strong> {dish.dining_hall__name}
        </p>
      </div>
      <button
        onClick={() => window.history.back()}
        className="mt-4 text-blue-500 underline"
      >
        Go Back
      </button>
    </div>
  );
}

export default DishDetail;
