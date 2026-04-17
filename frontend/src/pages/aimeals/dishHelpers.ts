import type { RecommendedDish } from "./types";

export function getDishHall(dish: RecommendedDish) {
  return dish.hall_name || dish.dining_hall_name || "";
}

export function hasDishNutrition(dish: RecommendedDish) {
  return ["calories", "protein", "carbohydrates", "fat"].every(
    (field) => Number.isFinite(Number(dish[field as keyof RecommendedDish])),
  );
}
