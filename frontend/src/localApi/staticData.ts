/**
 * Loaders for the static JSON files produced by the daily ETL job
 * (backend `export_static` → frontend/public/data). Each file is fetched once
 * per page load and cached.
 */
import axios from "axios";
import type { MenuDish, MenuFile, MenuHall } from "../lib/chatCore";

export type { MenuDish, MenuFile, MenuHall };

export interface HoursRow {
  option_id: number;
  date: string;
  period: string;
  start_24: string;
  end_24: string;
  start: string;
  end: string;
}

export interface EmbeddingEntry {
  id: number;
  s: number;
  q: string;
}

export interface AnalyticsEventRecord {
  timestamp: string;
  event_type: string;
  user: number | string | null;
  session_id: string;
  prompt_chars: number;
  prompt_text_redacted: string;
  input_bucket: string;
  intent_label: string;
  latency_ms: number;
  success: boolean;
  model_name: string;
  total_tokens: number;
  estimated_cost_usd: number;
}

const DATA_BASE = `${import.meta.env.BASE_URL}data`;
const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    const promise = axios.get<T>(`${DATA_BASE}/${file}`).then((res) => res.data);
    promise.catch(() => cache.delete(file));
    cache.set(file, promise);
  }
  return cache.get(file) as Promise<T>;
}

export interface Catalog {
  menu: MenuFile;
  hallsById: Map<number, MenuHall>;
  dishesById: Map<number, MenuDish>;
  /** Dishes on the latest scraped menu ("today's menu"). */
  todayDishes: MenuDish[];
}

let catalogPromise: Promise<Catalog> | null = null;

export function getCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = load<MenuFile>("menu.json").then((menu) => ({
      menu,
      hallsById: new Map(menu.halls.map((h) => [h.Dining_Hall_ID, h])),
      dishesById: new Map(menu.dishes.map((d) => [d.dish_id, d])),
      todayDishes: menu.dishes.filter((d) => d.last_seen && d.last_seen === menu.menu_date),
    }));
    catalogPromise.catch(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
}

export const getHours = () => load<{ generated_at: string; rows: HoursRow[] }>("hours.json");
export const getEmbeddings = () =>
  load<{ model: string; dim: number; vectors: EmbeddingEntry[] }>("embeddings.json");
export const getAnalyticsSnapshot = () =>
  load<{ events: AnalyticsEventRecord[] }>("analytics-snapshot.json");
