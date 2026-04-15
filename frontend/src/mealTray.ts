import { useSyncExternalStore } from "react";

export interface MealTrayItem {
  dish_id: number;
  dish_name: string;
  hall: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  serving_size?: string;
  quantity: number;
}

export interface MealTrayTotals {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

const STORAGE_KEY = "smarteats_meal_tray_v1";
const CHANGE_EVENT = "smarteats:meal-tray-change";
const EMPTY_TRAY: MealTrayItem[] = [];

let cachedRaw: string | null = null;
let cachedItems: MealTrayItem[] = EMPTY_TRAY;

function sanitizeItem(raw: unknown): MealTrayItem | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Record<string, unknown>;
  const dishId = Number(item.dish_id);
  if (!Number.isInteger(dishId) || dishId <= 0) return null;

  const dishName = String(item.dish_name || "").trim();
  const hall = String(item.hall || "").trim();
  if (!dishName || !hall) return null;

  return {
    dish_id: dishId,
    dish_name: dishName,
    hall,
    calories: Number(item.calories) || 0,
    protein: Number(item.protein) || 0,
    carbohydrates: Number(item.carbohydrates) || 0,
    fat: Number(item.fat) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
    serving_size:
      typeof item.serving_size === "string" && item.serving_size.trim()
        ? item.serving_size.trim()
        : undefined,
  };
}

function emitMealTrayChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readMealTray(): MealTrayItem[] {
  if (typeof window === "undefined") return EMPTY_TRAY;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cachedRaw) return cachedItems;
    if (!raw) {
      cachedRaw = raw;
      cachedItems = EMPTY_TRAY;
      return cachedItems;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedRaw = raw;
      cachedItems = EMPTY_TRAY;
      return cachedItems;
    }

    cachedRaw = raw;
    cachedItems = parsed
      .map((item) => sanitizeItem(item))
      .filter((item): item is MealTrayItem => item !== null);
    return cachedItems;
  } catch {
    cachedRaw = null;
    cachedItems = EMPTY_TRAY;
    return cachedItems;
  }
}

function writeMealTray(items: MealTrayItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  emitMealTrayChange();
}

export function addToMealTray(item: Omit<MealTrayItem, "quantity">, quantity = 1) {
  const current = readMealTray();
  const amount = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  const existingIndex = current.findIndex(
    (existing) => existing.dish_id === item.dish_id,
  );

  if (existingIndex >= 0) {
    const next = current.map((existing, index) =>
      index === existingIndex
        ? { ...existing, quantity: existing.quantity + amount }
        : existing,
    );
    writeMealTray(next);
    return { added: false, items: next };
  }

  const next = [...current, { ...item, quantity: amount }];
  writeMealTray(next);
  return { added: true, items: next };
}

export function incrementMealTrayItem(dishId: number, amount = 1) {
  const current = readMealTray();
  const increment = Number.isInteger(amount) && amount > 0 ? amount : 1;
  const next = current.map((item) =>
    item.dish_id === dishId
      ? { ...item, quantity: item.quantity + increment }
      : item,
  );
  writeMealTray(next);
  return next;
}

export function decrementMealTrayItem(dishId: number, amount = 1) {
  const current = readMealTray();
  const decrement = Number.isInteger(amount) && amount > 0 ? amount : 1;
  const next = current
    .map((item) =>
      item.dish_id === dishId
        ? { ...item, quantity: Math.max(0, item.quantity - decrement) }
        : item,
    )
    .filter((item) => item.quantity > 0);
  writeMealTray(next);
  return next;
}

export function removeFromMealTray(dishId: number) {
  const next = readMealTray().filter((item) => item.dish_id !== dishId);
  writeMealTray(next);
  return next;
}

export function clearMealTray() {
  writeMealTray([]);
}

export function getMealTrayTotals(items: MealTrayItem[]): MealTrayTotals {
  return items.reduce(
    (totals, item) => ({
      calories: totals.calories + item.calories * item.quantity,
      protein: totals.protein + item.protein * item.quantity,
      carbohydrates: totals.carbohydrates + item.carbohydrates * item.quantity,
      fat: totals.fat + item.fat * item.quantity,
    }),
    { calories: 0, protein: 0, carbohydrates: 0, fat: 0 },
  );
}

export function getMealTrayDishIds(items: MealTrayItem[]) {
  return items.flatMap((item) => Array.from({ length: item.quantity }, () => item.dish_id));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const onChange = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };

  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useMealTray() {
  const items = useSyncExternalStore(subscribe, readMealTray, () => EMPTY_TRAY);
  const totals = getMealTrayTotals(items);
  const totalServings = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    totals,
    count: totalServings,
    uniqueCount: items.length,
    isInTray: (dishId: number) =>
      items.some((item) => item.dish_id === dishId),
    getItemQuantity: (dishId: number) =>
      items.find((item) => item.dish_id === dishId)?.quantity || 0,
    addItem: addToMealTray,
    incrementItem: incrementMealTrayItem,
    decrementItem: decrementMealTrayItem,
    removeItem: removeFromMealTray,
    clear: clearMealTray,
  };
}
