/**
 * SmartEats AI chat core — a dependency-free TypeScript port of
 * backend/mealPlanning/services/ai_chat.py.
 *
 * Shared by the browser (offline fallback) and the Vercel function in
 * api/chat.ts (Gemini call). Keep this file free of imports so it can be
 * loaded by both runtimes as-is.
 */

export interface MenuDish {
  dish_id: number;
  dish_name: string;
  dining_hall: number;
  category: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number | null;
  sodium: number | null;
  allergens: string[];
  dietary_flags: string[];
  nutrition_source: string;
  ai_confidence: string;
  meal_period: string;
  course: string;
  serving_unit: string;
  serving_size: string;
  uiuc_item_id: number | null;
  last_seen: string | null;
}

export interface MenuHall {
  Dining_Hall_ID: number;
  name: string;
  location: string;
  option_id: number | null;
}

export interface MenuFile {
  generated_at: string;
  menu_date: string | null;
  halls: MenuHall[];
  dishes: MenuDish[];
}

export interface Macros {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
}

export interface DishRecord extends Macros {
  dish_id: number;
  dish_name: string;
  dining_hall_name: string;
  hall_name: string;
  serving_unit: string;
  serving_size: string;
  meal_period: string;
  course: string;
  dietary_flags: string[];
  allergens: string[];
}

export interface Recommendation extends Partial<Macros> {
  dish_id: number;
  dish_name: string;
  reason: string;
  dining_hall_name?: string;
  hall_name?: string;
  serving_unit?: string;
  serving_size?: string;
  meal_period?: string;
  course?: string;
  quantity?: number;
}

export interface MealPlan {
  title: string;
  summary: string;
  items: Recommendation[];
  totals: Macros;
  remaining_after: Macros;
  action_label: string;
  note: string;
}

export interface ChatResult {
  response: string;
  recommended_dishes: Recommendation[];
  follow_up_suggestions: string[];
  meal_plan?: MealPlan;
  _meta: {
    model_name: string;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    token_source: string;
  };
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

export type UserContext = Record<string, unknown>;

export interface MenuContext {
  hallNames: string[];
  dishListText: string;
  dishLookup: Map<number, DishRecord>;
  nameIndex: Map<string, DishRecord[]>;
}

export const MAX_HISTORY_MESSAGES = 16;
const MAX_RECOMMENDATIONS = 5;
const MAX_FOLLOW_UP_SUGGESTIONS = 3;
const MAX_MENU_CONTEXT_ITEMS = 45;
const MAX_MENU_SCAN_ITEMS = 350;

const ASSISTANT_STYLE_PREFIXES = [
  "are you", "do you", "would you", "could you", "can you", "what kind of", "which kind of",
];
const HIGH_PROTEIN_TERMS = [
  "high protein", "protein", "post workout", "post-workout", "muscle", "macro", "macros",
];
const LOW_CARB_TERMS = ["low carb", "lower carb", "few carbs", "carb limit", "carbohydrate limit"];
const GOAL_PLAN_TERMS = [
  "remaining goal", "remaining goals", "hit my goal", "hit my goals", "hit my macro",
  "hit my macros", "plan out a meal", "plan a meal", "build a meal",
];
const BAKERY_DESSERT_TERMS = [
  "muffin", "donut", "doughnut", "cookie", "cake", "danish", "brownie", "blondie", "bar",
  "pie", "cobbler", "pastry",
];
const HALL_ALIASES: Record<string, string[]> = {
  ike: ["ikenberry", "ike"],
  ikenberry: ["ikenberry", "ike"],
  isr: ["illinois street", "isr"],
  par: ["pennsylvania avenue", "par"],
  far: ["florida avenue", "far"],
  lar: ["lincoln avenue", "lar"],
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeName(name: unknown): string {
  return String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function remainingGoals(userContext?: UserContext): Partial<Macros> {
  const raw = userContext?.today_remaining_goals;
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return {
    calories: toNumber(r.calories),
    protein: toNumber(r.protein),
    carbohydrates: toNumber(r.carbohydrates ?? r.carbs),
    fat: toNumber(r.fat),
  };
}

function isHighProteinIntent(message: string, userContext?: UserContext): boolean {
  const lower = message.toLowerCase();
  return HIGH_PROTEIN_TERMS.some((t) => lower.includes(t)) || (remainingGoals(userContext).protein ?? 0) >= 40;
}

function isLowCarbIntent(message: string, userContext?: UserContext): boolean {
  const lower = message.toLowerCase();
  const carbs = remainingGoals(userContext).carbohydrates ?? 0;
  return LOW_CARB_TERMS.some((t) => lower.includes(t)) || (carbs > 0 && carbs <= 80);
}

export function wantsGoalMealPlan(message: string, userContext?: UserContext): boolean {
  if (Object.keys(remainingGoals(userContext)).length === 0) return false;
  const lower = message.toLowerCase();
  return (
    GOAL_PLAN_TERMS.some((t) => lower.includes(t)) ||
    (lower.includes("remaining") &&
      (lower.includes("protein") || lower.includes("macro") || lower.includes("meal")))
  );
}

function inferHallAliases(message: string): Set<string> {
  const lower = message.toLowerCase();
  const aliases = new Set<string>();
  for (const [trigger, mapped] of Object.entries(HALL_ALIASES)) {
    if (new RegExp(`\\b${escapeRegExp(trigger)}\\b`).test(lower)) mapped.forEach((a) => aliases.add(a));
  }
  return aliases;
}

function matchesHall(record: DishRecord, aliases: Set<string>): boolean {
  if (aliases.size === 0) return true;
  const hall = normalizeName(record.dining_hall_name);
  return [...aliases].some((alias) => hall.includes(alias));
}

function toRecord(dish: MenuDish, hallName: string): DishRecord {
  return {
    dish_id: dish.dish_id,
    dish_name: dish.dish_name,
    dining_hall_name: hallName,
    hall_name: hallName,
    serving_unit: dish.serving_unit || "",
    serving_size: dish.serving_size || "",
    meal_period: dish.meal_period || "",
    course: dish.course || "",
    calories: toNumber(dish.calories),
    protein: toNumber(dish.protein),
    carbohydrates: toNumber(dish.carbohydrates),
    fat: toNumber(dish.fat),
    dietary_flags: dish.dietary_flags || [],
    allergens: dish.allergens || [],
  };
}

function formatRecordLine(r: DishRecord): string {
  const flags = r.dietary_flags.join(", ");
  const allergens = r.allergens.join(", ");
  const serving = r.serving_size || r.serving_unit || "1 serving";
  return (
    `- id=${r.dish_id} | ${r.dish_name} | ${r.dining_hall_name} | ${serving} | ` +
    `${r.calories} kcal, ${r.protein}g protein, ${r.carbohydrates}g carbs, ${r.fat}g fat | ` +
    `flags: ${flags || "none"} | allergens: ${allergens || "none"}`
  );
}

function isBakeryOrDessert(r: DishRecord): boolean {
  const haystack = `${r.dish_name} ${r.course} ${r.serving_unit}`.toLowerCase();
  return BAKERY_DESSERT_TERMS.some((t) => haystack.includes(t));
}

function recordScore(r: DishRecord, message: string, userContext?: UserContext): number {
  const { protein, carbohydrates: carbs, fat } = r;
  const calories = Math.max(r.calories, 1);
  const density = protein / calories;
  const remaining = remainingGoals(userContext);
  let score = protein * 1.5 + density * 240;

  if (isHighProteinIntent(message, userContext)) {
    score += protein * 2.8 + density * 520;
    score -= carbs * 0.9 + fat * 0.65;
    if (protein < 12) score -= 120;
    if (isBakeryOrDessert(r) && (protein < 20 || carbs > Math.max(25, protein * 2))) score -= 240;
  }
  if (isLowCarbIntent(message, userContext)) {
    score -= carbs * 1.25;
    if (carbs <= 15) score += 30;
  }
  if ((remaining.calories ?? 0) > 0) {
    const over = calories - (remaining.calories ?? 0);
    score += over <= 0 ? 18 : -Math.min(200, over * 0.25);
  }
  if ((remaining.fat ?? 0) > 0 && fat <= Math.max(12, (remaining.fat ?? 0) / 3)) score += 12;

  const ignored = new Set(["meal", "goals", "remaining", "help", "plan"]);
  const tokens = normalizeName(message).split(" ").filter((t) => t.length >= 4 && !ignored.has(t));
  const normalizedName = normalizeName(r.dish_name);
  for (const token of tokens) if (normalizedName.includes(token)) score += 20;
  return score;
}

/** Today's dishes (the latest menu date), falling back to the full catalog. */
export function currentMenuDishes(menu: MenuFile): MenuDish[] {
  const today = menu.dishes.filter((d) => d.last_seen && d.last_seen === menu.menu_date);
  return today.length ? today : menu.dishes;
}

export function buildMenuContext(
  menu: MenuFile,
  message: string,
  userContext?: UserContext,
): MenuContext {
  const hallById = new Map(menu.halls.map((h) => [h.Dining_Hall_ID, h.name]));
  const hallNames = menu.halls.map((h) => h.name);
  const aliases = inferHallAliases(message);

  let pool = menu.dishes.filter((d) => d.calories > 0);
  if (aliases.size) {
    const scoped = pool.filter((d) => {
      const hall = (hallById.get(d.dining_hall) ?? "").toLowerCase();
      return [...aliases].some((a) => hall.includes(a));
    });
    if (scoped.length) pool = scoped;
  }
  const today = pool.filter((d) => d.last_seen && d.last_seen === menu.menu_date);
  const dishes = (today.length ? today : pool)
    .map((d) => toRecord(d, hallById.get(d.dining_hall) ?? ""))
    .sort(
      (a, b) =>
        a.dining_hall_name.localeCompare(b.dining_hall_name) ||
        a.serving_unit.localeCompare(b.serving_unit) ||
        a.dish_name.localeCompare(b.dish_name),
    )
    .slice(0, MAX_MENU_SCAN_ITEMS)
    .filter((r) => matchesHall(r, aliases));

  const selected = dishes
    .map((r) => ({ r, s: recordScore(r, message, userContext) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, MAX_MENU_CONTEXT_ITEMS)
    .map((x) => x.r);

  const dishLookup = new Map<number, DishRecord>();
  const nameIndex = new Map<string, DishRecord[]>();
  for (const r of selected) {
    dishLookup.set(r.dish_id, r);
    const norm = normalizeName(r.dish_name);
    if (norm) nameIndex.set(norm, [...(nameIndex.get(norm) ?? []), r]);
  }
  return { hallNames, dishListText: selected.map(formatRecordLine).join("\n"), dishLookup, nameIndex };
}

function groundedReason(r: Partial<DishRecord>): string {
  const serving = r.serving_size || r.serving_unit || "1 serving";
  return `${r.calories} kcal, ${r.protein}g protein, ${r.carbohydrates}g carbs, ${r.fat}g fat per ${serving}.`;
}

function serializeRecommendation(r: DishRecord, reason?: string, quantity = 1): Recommendation {
  const payload: Recommendation = {
    dish_id: r.dish_id,
    dish_name: r.dish_name,
    reason: reason || groundedReason(r),
    dining_hall_name: r.dining_hall_name,
    hall_name: r.hall_name,
    serving_unit: r.serving_unit,
    serving_size: r.serving_size,
    meal_period: r.meal_period,
    course: r.course,
    calories: r.calories,
    protein: r.protein,
    carbohydrates: r.carbohydrates,
    fat: r.fat,
  };
  if (quantity > 1) payload.quantity = quantity;
  return payload;
}

export function normalizeHistory(history: unknown): HistoryItem[] {
  if (!Array.isArray(history)) return [];
  const out: HistoryItem[] = [];
  for (const item of history.slice(-MAX_HISTORY_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const role = String((item as Record<string, unknown>).role ?? "").trim().toLowerCase();
    const content = String((item as Record<string, unknown>).content ?? "").trim();
    if (!content) continue;
    if (role === "assistant" || role === "ai") out.push({ role: "assistant", content });
    else if (role === "user") out.push({ role: "user", content });
  }
  return out;
}

function formatHistory(history: HistoryItem[]): string {
  if (!history.length) return "No previous conversation.";
  return history.map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n");
}

function formatUserContext(userContext?: UserContext): string {
  if (!userContext || !Object.keys(userContext).length) return "No authenticated user profile context.";
  const keys = [
    "name", "goal", "sex", "age", "height_cm", "weight_kg", "activity_level", "daily_goals",
    "today_logged_totals", "today_remaining_goals", "logged_meals_today", "current_meal_tray",
    "dietary_preferences", "allergy_avoidances",
  ];
  const lines: string[] = [];
  for (const key of keys) {
    let value = userContext[key];
    if (value === "" || value === null || value === undefined) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (typeof value === "object" && value && !Object.keys(value).length) continue;
    if (typeof value === "object") value = JSON.stringify(value);
    lines.push(`- ${key}: ${String(value)}`);
  }
  return lines.length ? lines.join("\n") : "No authenticated user profile context.";
}

/** difflib.SequenceMatcher-style ratio (2*matches / total) via longest common subsequence blocks. */
function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

export function resolveRecommendedDishes(raw: unknown, ctx: MenuContext): Recommendation[] {
  if (!Array.isArray(raw)) return [];
  const resolved: Recommendation[] = [];
  const seen = new Set<number>();
  const nameKeys = [...ctx.nameIndex.keys()];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (!String(entry.reason ?? "").trim()) continue;

    let record: DishRecord | undefined;
    const id = Number(entry.dish_id);
    if (Number.isInteger(id)) record = ctx.dishLookup.get(id);
    if (!record) {
      const norm = normalizeName(entry.dish_name);
      if (norm && ctx.nameIndex.get(norm)?.length) {
        record = ctx.nameIndex.get(norm)![0];
      } else if (norm) {
        let best = "";
        let bestScore = 0.8;
        for (const key of nameKeys) {
          const s = similarity(norm, key);
          if (s >= bestScore) {
            best = key;
            bestScore = s;
          }
        }
        if (best) record = ctx.nameIndex.get(best)?.[0];
      }
    }
    if (!record || seen.has(record.dish_id)) continue;
    seen.add(record.dish_id);
    resolved.push(serializeRecommendation(record));
    if (resolved.length >= MAX_RECOMMENDATIONS) break;
  }
  return resolved;
}

function totalsFor(items: (Macros & { quantity?: number })[]): Macros {
  const totals: Macros = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 };
  for (const item of items) {
    const q = Math.max(1, toNumber(item.quantity, 1));
    totals.calories += toNumber(item.calories) * q;
    totals.protein += toNumber(item.protein) * q;
    totals.carbohydrates += toNumber(item.carbohydrates) * q;
    totals.fat += toNumber(item.fat) * q;
  }
  return totals;
}

function remainingAfter(remaining: Partial<Macros>, totals: Macros): Macros {
  return {
    calories: Math.max(0, (remaining.calories ?? 0) - totals.calories),
    protein: Math.max(0, (remaining.protein ?? 0) - totals.protein),
    carbohydrates: Math.max(0, (remaining.carbohydrates ?? 0) - totals.carbohydrates),
    fat: Math.max(0, (remaining.fat ?? 0) - totals.fat),
  };
}

function canAddToPlan(r: DishRecord, totals: Macros, remaining: Partial<Macros>): boolean {
  const next = {
    calories: totals.calories + r.calories,
    carbohydrates: totals.carbohydrates + r.carbohydrates,
    fat: totals.fat + r.fat,
  };
  const calCap = remaining.calories ?? 0;
  const carbCap = remaining.carbohydrates ?? 0;
  const fatCap = remaining.fat ?? 0;
  if (calCap > 0 && next.calories > calCap * 1.05) return false;
  if (carbCap > 0 && next.carbohydrates > carbCap * 1.05) return false;
  if (fatCap > 0 && next.fat > fatCap * 1.05) return false;
  return true;
}

function planCandidates(ctx: MenuContext, message: string, userContext?: UserContext): DishRecord[] {
  const aliases = inferHallAliases(message);
  const highProtein = isHighProteinIntent(message, userContext);
  return [...ctx.dishLookup.values()]
    .filter((r) => matchesHall(r, aliases))
    .filter((r) => {
      const calories = Math.max(r.calories, 1);
      if (r.protein <= 0) return false;
      if (highProtein) {
        if (r.protein < 12 || r.protein / calories < 0.035) return false;
        if (isBakeryOrDessert(r) && (r.protein < 20 || r.carbohydrates > Math.max(25, r.protein * 2))) return false;
      }
      return true;
    })
    .map((r) => ({ r, s: recordScore(r, message, userContext) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

type PlanItem = DishRecord & { quantity: number; reason: string };

export function buildGoalMealPlan(
  message: string,
  userContext: UserContext | undefined,
  ctx: MenuContext,
): ChatResult | null {
  const remaining = remainingGoals(userContext);
  const candidates = planCandidates(ctx, message, userContext);
  if (!Object.keys(remaining).length || !candidates.length) return null;

  const targetProtein = remaining.protein ?? 0;
  let totals: Macros = { calories: 0, protein: 0, carbohydrates: 0, fat: 0 };
  const selected: PlanItem[] = [];
  const byId = new Map<number, PlanItem>();

  outer: for (const r of candidates) {
    if (selected.length >= MAX_RECOMMENDATIONS) break;
    const maxQuantity = r.protein >= 25 && r.carbohydrates <= 30 && r.fat <= 20 ? 2 : 1;
    for (let i = 0; i < maxQuantity; i++) {
      if (!canAddToPlan(r, totals, remaining)) break;
      totals.calories += r.calories;
      totals.protein += r.protein;
      totals.carbohydrates += r.carbohydrates;
      totals.fat += r.fat;
      const existing = byId.get(r.dish_id);
      if (existing) {
        existing.quantity += 1;
        existing.reason = groundedReason(existing);
      } else {
        const item: PlanItem = { ...r, quantity: 1, reason: groundedReason(r) };
        selected.push(item);
        byId.set(r.dish_id, item);
      }
      if (targetProtein && totals.protein >= targetProtein) break outer;
    }
  }

  if (!selected.length) {
    for (const r of candidates.slice(0, 3)) selected.push({ ...r, quantity: 1, reason: groundedReason(r) });
    totals = totalsFor(selected);
  }

  const after = remainingAfter(remaining, totals);
  const halls = [...new Set(selected.map((i) => i.dining_hall_name).filter(Boolean))].sort();
  const hallLabel = halls.length === 1 ? halls[0] : "the selected halls";
  const firstName = userContext?.name ? String(userContext.name).trim().split(/\s+/)[0] : "";

  const parts = [
    `${firstName ? `${firstName}, ` : ""}I would build this around leaner protein, ` +
      "not the muffin/donut-style items. Those are mostly carbs for this goal.",
    `The plan below comes straight from menu nutrition: ${totals.calories} kcal, ` +
      `${totals.protein}g protein, ${totals.carbohydrates}g carbs, and ${totals.fat}g fat.`,
  ];
  if (targetProtein && after.protein > 0) {
    parts.push(
      `It still leaves about ${after.protein}g protein, so hitting the full ` +
        `${targetProtein}g remaining target may need another lean serving later.`,
    );
  } else if (targetProtein) {
    parts.push("It covers your remaining protein target while staying grounded in the menu data.");
  }

  const items = selected.map((i) => serializeRecommendation(i, i.reason, i.quantity));
  return {
    response: parts.join(" "),
    recommended_dishes: items.slice(0, MAX_RECOMMENDATIONS),
    meal_plan: {
      title: `Protein-focused meal at ${hallLabel}`,
      summary: `${totals.calories} kcal · ${totals.protein}g protein · ${totals.carbohydrates}g carbs · ${totals.fat}g fat`,
      items,
      totals,
      remaining_after: after,
      action_label: "Add plan to tray",
      note: "All numbers are copied from SmartEats dish records per serving.",
    },
    follow_up_suggestions: [
      "Find one more lean protein item",
      "Show lower-carb swaps",
      "Compare another dining hall",
    ],
    _meta: { model_name: "smart_rule_planner", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, token_source: "fast_path" },
  };
}

export function sanitizeFollowUps(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const text = String(item ?? "").trim();
    if (!text || text.length > 80) continue;
    const lower = text.toLowerCase();
    if (ASSISTANT_STYLE_PREFIXES.some((p) => lower.startsWith(p)) || seen.has(lower)) continue;
    seen.add(lower);
    out.push(text);
    if (out.length >= MAX_FOLLOW_UP_SUGGESTIONS) break;
  }
  return out;
}

export function buildPrompt(
  message: string,
  history: HistoryItem[],
  userContext: UserContext | undefined,
  ctx: MenuContext,
): string {
  return (
    "You are SmartEats AI, a conversational nutrition coach for UIUC dining halls.\n" +
    "You are in an active back-and-forth chat. Keep continuity with prior messages and behave like a useful dining assistant, not a report generator.\n\n" +
    `AVAILABLE DINING HALLS:\n${ctx.hallNames.join(", ")}\n\n` +
    `RELEVANT CURRENT MENU CANDIDATES (exact nutrition data):\n${ctx.dishListText}\n\n` +
    `AUTHENTICATED USER PROFILE (if available):\n${formatUserContext(userContext)}\n\n` +
    `CONVERSATION HISTORY:\n${formatHistory(history)}\n\n` +
    `LATEST USER MESSAGE:\n${message}\n\n` +
    "Conversation style:\n" +
    '- Be direct, warm, and specific. Avoid stock openers like "Based on your goals" on every turn.\n' +
    "- Choose the shape that fits the moment: a short answer, a few bullets, a comparison, or a concrete meal idea.\n" +
    "- Vary phrasing across turns. Do not force every answer into the same template.\n" +
    "- Connect advice to the user's tray, remaining goals, dining hall, or prior preferences when that context exists.\n" +
    "- If the user asks casually, answer casually; if they ask for a plan, be more structured.\n\n" +
    "Behavior rules:\n" +
    "1. Nutrition accuracy is mandatory: never invent calories, protein, carbs, or fat. " +
    "Only repeat numbers exactly as shown in the menu candidate lines.\n" +
    "2. If recommending dishes, only use items from RELEVANT CURRENT MENU CANDIDATES.\n" +
    "3. Do not call an item high-protein unless it has at least 12g protein and a clear protein advantage. " +
    "For high-protein or remaining-macro requests, avoid muffins, donuts, cookies, cakes, and pastries unless the user explicitly asks for them.\n" +
    "4. Respect remaining goals from AUTHENTICATED USER PROFILE. If a full goal cannot be hit with the available menu, say that plainly.\n" +
    "5. Remember user preferences and constraints stated earlier in this conversation.\n" +
    "6. If user goals are unclear, ask one focused follow-up question.\n" +
    "7. Keep response concise but useful, usually 2-6 sentences unless the user asks for detail.\n" +
    "8. follow_up_suggestions must be written as user-ready prompts to tap next, " +
    'not assistant questions. Good examples: "Show vegetarian lunches", ' +
    '"Find something under 400 calories", "Compare high-protein dinners".\n' +
    "9. Stay on topic: food, nutrition and UIUC dining. Politely decline unrelated requests.\n\n" +
    "Return strict JSON with:\n" +
    '- "response": string\n' +
    '- "recommended_dishes": [{"dish_id": int, "dish_name": string, "reason": string}] (optional, max 5; use menu candidate ids)\n' +
    '- "follow_up_suggestions": [string] (optional, 1-3 short suggestions for next user prompts)'
  );
}

/** Turn the model's JSON text into a grounded ChatResult (or null if unusable). */
export function parseModelResponse(
  text: string,
  ctx: MenuContext,
  meta: ChatResult["_meta"],
): ChatResult | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, ""));
  } catch {
    return null;
  }
  const response = String(data.response ?? "").trim();
  if (!response) return null;
  return {
    response,
    recommended_dishes: resolveRecommendedDishes(data.recommended_dishes, ctx),
    follow_up_suggestions: sanitizeFollowUps(data.follow_up_suggestions),
    _meta: meta,
  };
}

/**
 * Deterministic answer used when the Gemini call is unavailable (quota hit,
 * no API key, offline). Ranks today's menu with the same scoring the prompt
 * context uses, so the reply is still grounded and useful.
 */
export function buildOfflineResponse(
  message: string,
  userContext: UserContext | undefined,
  ctx: MenuContext,
): ChatResult {
  const plan = wantsGoalMealPlan(message, userContext) ? buildGoalMealPlan(message, userContext, ctx) : null;
  if (plan) return plan;

  const picks = [...ctx.dishLookup.values()].slice(0, 3).map((r) => serializeRecommendation(r));
  const lines = picks.map(
    (p) => `• ${p.dish_name} (${p.dining_hall_name}): ${p.calories} kcal, ${p.protein}g protein`,
  );
  return {
    response: picks.length
      ? "The AI coach is taking a break right now (free-tier limit), so here are the best matches " +
        `from today's menu for your request, ranked by SmartEats' nutrition scoring:\n${lines.join("\n")}`
      : "The AI coach is taking a break right now, and I couldn't find menu items for that request.",
    recommended_dishes: picks,
    follow_up_suggestions: ["Show high-protein dinners", "Find something under 500 calories", "Show vegetarian options"],
    _meta: { model_name: "offline_ranker", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, token_source: "fallback" },
  };
}
