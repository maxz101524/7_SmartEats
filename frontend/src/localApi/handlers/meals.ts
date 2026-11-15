/** Meal logging, reports and exports — the user's meals live in this browser. */
import { localDate, mutate, readDb, type LocalMeal } from "../db";
import { getCatalog } from "../staticData";
import { bodyObject, fail, isResponse, ok, requireUser, type Handler } from "../http";

function serializeMeal(meal: LocalMeal) {
  return {
    meal_id: meal.meal_id,
    category: meal.category,
    total_calories: meal.total_calories,
    total_protein: meal.total_protein,
    total_carbohydrates: meal.total_carbohydrates,
    total_fat: meal.total_fat,
    date: meal.date,
    dishes: [...meal.dishes].sort((a, b) => a.dish_name.localeCompare(b.dish_name)),
  };
}

function userMeals(userId: number): LocalMeal[] {
  return readDb()
    .meals.filter((m) => m.user === userId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.meal_id - a.meal_id);
}

export const listMeals: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  return ok(userMeals(user.id).map(serializeMeal));
};

export const createMeal: Handler = async (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const body = bodyObject(req);
  const rawIds = body.dish_ids;
  if (!Array.isArray(rawIds) || !rawIds.length) return fail(400, "dish_ids must be a non-empty list.");
  const ids = rawIds.map(Number);
  if (ids.some((id) => !Number.isInteger(id))) return fail(400, "Each dish id must be an integer.");

  const { dishesById, hallsById } = await getCatalog();
  const missing = [...new Set(ids)].filter((id) => !dishesById.has(id)).sort((a, b) => a - b);
  if (missing.length) return fail(400, `Some dishes could not be found: [${missing.join(", ")}].`);

  const ordered = ids.map((id) => dishesById.get(id)!);
  const unique = [...new Map(ordered.map((d) => [d.dish_id, d])).values()];
  const derived =
    ordered.find((d) => d.meal_period)?.meal_period ||
    ordered.find((d) => d.category)?.category ||
    ordered.find((d) => d.course)?.course ||
    "Logged Meal";
  const category = String(body.category ?? "").trim() || derived;

  const meal = mutate((db) => {
    db.seq.meal += 1;
    const created: LocalMeal = {
      meal_id: db.seq.meal,
      user: user.id,
      category,
      total_calories: ordered.reduce((s, d) => s + d.calories, 0),
      total_protein: ordered.reduce((s, d) => s + d.protein, 0),
      total_carbohydrates: ordered.reduce((s, d) => s + d.carbohydrates, 0),
      total_fat: ordered.reduce((s, d) => s + d.fat, 0),
      date: localDate(),
      dishes: unique.map((d) => ({
        dish_id: d.dish_id,
        dish_name: d.dish_name,
        hall_name: hallsById.get(d.dining_hall)?.name ?? "",
      })),
    };
    db.meals.push(created);
    return created;
  });
  return ok(serializeMeal(meal), 201);
};

export const mealsPerDay: Handler = (req) => {
  const user = requireUser(req);
  const meals = isResponse(user) ? [] : userMeals(user.id);
  const counts = new Map<string, number>();
  for (const m of meals) counts.set(m.date, (counts.get(m.date) ?? 0) + 1);
  return ok([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })));
};

export const mealReports: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const start = req.query.get("start");
  const end = req.query.get("end");
  const meals = userMeals(user.id).filter((m) => !(start && end) || (m.date >= start && m.date <= end));

  const categories = new Map<string, number>();
  for (const m of meals) categories.set(m.category || "Uncategorized", (categories.get(m.category || "Uncategorized") ?? 0) + 1);

  return ok({
    user_info: {
      netID: user.profile.netID,
      name: `${user.first_name} ${user.last_name}`.trim(),
    },
    statistics: {
      total_count: meals.length,
      macros: {
        labels: ["Protein", "Carbs", "Fat"],
        values: [
          meals.reduce((s, m) => s + m.total_protein, 0),
          meals.reduce((s, m) => s + m.total_carbohydrates, 0),
          meals.reduce((s, m) => s + m.total_fat, 0),
        ],
      },
      categories: { labels: [...categories.keys()], values: [...categories.values()] },
    },
    chart_base64: "",
  });
};

export const exportMeals: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const format = (req.query.get("file_format") || req.query.get("format") || "csv").toLowerCase();
  if (format !== "csv" && format !== "json") return fail(400, "Invalid format. Use 'csv' or 'json'.");
  const meals = readDb()
    .meals.filter((m) => m.user === user.id)
    .sort((a, b) => b.date.localeCompare(a.date) || a.meal_id - b.meal_id);

  if (format === "json") {
    const data = {
      generated_at: new Date().toISOString(),
      record_count: meals.length,
      meals: meals.map((m) => ({
        meal_id: m.meal_id,
        total_calories: m.total_calories,
        total_protein: m.total_protein,
        total_carbohydrates: m.total_carbohydrates,
        total_fat: m.total_fat,
        date: m.date,
      })),
    };
    return { status: 200, data: JSON.stringify(data, null, 2), headers: { "content-type": "application/json" } };
  }

  const rows = [
    ["Meal ID", "Total Calories", "Total Protein (g)", "Total Carbohydrates (g)", "Total Fat (g)", "Date"],
    ...meals.map((m) => [m.meal_id, m.total_calories, m.total_protein, m.total_carbohydrates, m.total_fat, m.date]),
  ];
  return { status: 200, data: rows.map((r) => r.join(",")).join("\r\n") + "\r\n", headers: { "content-type": "text/csv" } };
};
