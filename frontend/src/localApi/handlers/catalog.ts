/** Dining halls, dishes, hall status and catalog stats (read-only menu data). */
import { getCatalog, getHours, type HoursRow, type MenuDish } from "../staticData";
import { fail, ok, type Handler } from "../http";

const HALL_DISH_FIELDS = [
  "dish_id", "dish_name", "calories", "protein", "carbohydrates", "fat", "fiber", "sodium",
  "allergens", "dietary_flags", "nutrition_source", "ai_confidence", "meal_period", "course",
  "serving_unit", "serving_size",
] as const;

function pick(dish: MenuDish) {
  const out: Record<string, unknown> = {};
  for (const field of HALL_DISH_FIELDS) out[field] = dish[field];
  return out;
}

function countBy<T>(items: T[], key: (item: T) => string, label: string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ [label]: value, count }))
    .sort((a, b) => b.count - a.count);
}

export const listHalls: Handler = async () => {
  const { menu, todayDishes } = await getCatalog();
  return ok(
    menu.halls.map((hall) => ({
      Dining_Hall_ID: hall.Dining_Hall_ID,
      name: hall.name,
      location: hall.location,
      dishes: todayDishes.filter((d) => d.dining_hall === hall.Dining_Hall_ID).map(pick),
    })),
  );
};

export const listDishes: Handler = async (req) => {
  const { hallsById, todayDishes } = await getCatalog();
  const search = req.query.get("search")?.toLowerCase();
  const hallId = req.query.get("hall_id");
  const dishes = todayDishes
    .filter((d) => !search || d.dish_name.toLowerCase().includes(search))
    .filter((d) => !hallId || String(d.dining_hall) === hallId);
  return ok(
    dishes.map((d) => ({
      ...pick(d),
      category: d.category,
      dining_hall__name: hallsById.get(d.dining_hall)?.name ?? "",
      detail_url: `/api/dishes/${d.dish_id}`,
    })),
  );
};

export const dishDetail: Handler = async (_req, [id]) => {
  const { hallsById, dishesById } = await getCatalog();
  const dish = dishesById.get(Number(id));
  if (!dish) return { status: 404, data: { detail: "Not found." } };
  return ok({
    ...dish,
    dining_hall__name: hallsById.get(dish.dining_hall)?.name ?? "",
    detail_url: `/api/dishes/${dish.dish_id}`,
  });
};

export const dishStats: Handler = async () => {
  const { menu, hallsById } = await getCatalog();
  return ok({
    total_dishes: menu.dishes.length,
    total_halls: menu.halls.length,
    dishes_by_category: countBy(menu.dishes, (d) => d.category, "category"),
    dishes_by_hall: countBy(menu.dishes, (d) => hallsById.get(d.dining_hall)?.name ?? "", "dining_hall__name"),
  });
};

export const dishesByCategory: Handler = async () => {
  const { menu } = await getCatalog();
  return ok(countBy(menu.dishes, (d) => d.category, "category"));
};

export const manageDishesList: Handler = async () => {
  const { menu } = await getCatalog();
  return ok(menu.dishes.map((d) => ({ ...d, dining_hall_id: d.dining_hall })));
};

export const manageDishesCreate: Handler = () =>
  fail(403, "The live demo is read-only: menus are refreshed automatically from UIUC Dining every day.");

/* ── Hall open/closed status (port of services/uiuc_hours.compute_status) ── */

const DINING_OPTION_IDS = [1, 2, 3, 5, 12, 23];

function centralNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function computeHallStatus(rows: HoursRow[]) {
  const now = centralNow();
  const status: Record<string, { is_open: boolean; meal_label: string | null; closes_at: string | null }> = {};
  for (const optionId of DINING_OPTION_IDS) {
    const active = rows.find((row) => {
      if (row.option_id !== optionId || row.date !== now.date) return false;
      const start = toMinutes(row.start_24);
      let end = toMinutes(row.end_24);
      if (start === null || end === null) return false;
      if (end <= start) end += 24 * 60;
      return start <= now.minutes && now.minutes < end;
    });
    status[String(optionId)] = active
      ? { is_open: true, meal_label: active.period, closes_at: active.end }
      : { is_open: false, meal_label: null, closes_at: null };
  }
  return status;
}

export const hallStatus: Handler = async () => {
  try {
    const { rows } = await getHours();
    return ok(computeHallStatus(rows));
  } catch {
    return ok({});
  }
};
