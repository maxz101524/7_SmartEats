/**
 * Browser-local "database" standing in for the Django models that held
 * per-user data (User, UserProfile, Meal, Conversation, AIAnalyticsEvent...).
 * Everything lives in one localStorage entry, so accounts and meal logs exist
 * only in the visitor's own browser.
 */

export interface LocalProfile {
  netID: string | null;
  sex: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: string | null;
  activity_level: string | null;
  daily_cal_goal: number | null;
  daily_protein_goal: number | null;
  daily_carbs_goal: number | null;
  daily_fat_goal: number | null;
  goals_source: string | null;
}

export interface LocalUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  date_joined: string;
  profile: LocalProfile;
}

export interface LocalMeal {
  meal_id: number;
  user: number;
  category: string;
  total_calories: number;
  total_protein: number;
  total_carbohydrates: number;
  total_fat: number;
  date: string;
  dishes: { dish_id: number; dish_name: string; hall_name: string }[];
}

export interface LocalMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LocalConversation {
  id: number;
  user: number;
  title: string;
  updated_at: string;
  messages: LocalMessage[];
}

export interface LocalEvent {
  timestamp: string;
  event_type: string;
  user: number | null;
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

export interface LocalDB {
  version: 1;
  users: LocalUser[];
  tokens: Record<string, number>;
  meals: LocalMeal[];
  conversations: LocalConversation[];
  events: LocalEvent[];
  recommendations: Record<string, { date: string; signature: string; recommendations: unknown[]; tip: string; generated_at: string }>;
  seq: { user: number; meal: number; convo: number; message: number };
}

const STORAGE_KEY = "smarteats_local_db_v1";
const MAX_EVENTS = 1000;
const MAX_CONVERSATIONS = 20;

function emptyDb(): LocalDB {
  return {
    version: 1,
    users: [],
    tokens: {},
    meals: [],
    conversations: [],
    events: [],
    recommendations: {},
    seq: { user: 0, meal: 0, convo: 0, message: 0 },
  };
}

// Fallback only for when localStorage is unavailable (blocked or full).
let memoryDb: LocalDB | null = null;

/** Always re-reads storage so other tabs / module instances never get overwritten with stale data. */
export function readDb(): LocalDB {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyDb(), ...(JSON.parse(raw) as LocalDB) };
  } catch {
    // fall through to the in-memory copy
  }
  return memoryDb ?? emptyDb();
}

export function writeDb(db: LocalDB): void {
  db.events = db.events.slice(-MAX_EVENTS);
  memoryDb = db;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked (private mode): keep the in-memory copy for this session.
  }
}

/** Run a mutation against the DB and persist it. */
export function mutate<T>(fn: (db: LocalDB) => T): T {
  const db = readDb();
  const result = fn(db);
  if (db.conversations.length > MAX_CONVERSATIONS) {
    db.conversations.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    db.conversations = db.conversations.slice(0, MAX_CONVERSATIONS);
  }
  writeDb(db);
  return result;
}

export function userForToken(token: string | null): LocalUser | null {
  if (!token) return null;
  const db = readDb();
  const id = db.tokens[token];
  return db.users.find((u) => u.id === id) ?? null;
}

export function emptyProfile(netID: string | null = null): LocalProfile {
  return {
    netID,
    sex: null,
    age: null,
    height_cm: null,
    weight_kg: null,
    goal: null,
    activity_level: null,
    daily_cal_goal: null,
    daily_protein_goal: null,
    daily_carbs_goal: null,
    daily_fat_goal: null,
    goals_source: null,
  };
}

export function newToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(username: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`smarteats:${username.toLowerCase()}:${password}`);
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return btoa(String.fromCharCode(...data));
}

/** Local calendar date (YYYY-MM-DD), matching Django's timezone.localdate(). */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
