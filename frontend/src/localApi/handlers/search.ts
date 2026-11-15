/**
 * Hybrid semantic dish search — a port of services/semantic_search.py.
 *
 * Dish vectors (all-MiniLM-L6-v2) are precomputed by the daily ETL job; the
 * query is embedded in the browser with transformers.js (the same model,
 * downloaded once from the Hugging Face CDN and cached). If the model can't
 * load, ranking falls back to the lexical/nutrition/dietary signals.
 */
import { getCatalog, getEmbeddings, type MenuDish } from "../staticData";
import { fail, ok, type Handler } from "../http";

const MIN_SCORE = 0.3;
const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

const STOPWORDS = new Set([
  "a", "an", "and", "any", "are", "at", "be", "but", "by", "can", "for", "from", "get", "give",
  "hall", "have", "i", "in", "is", "like", "me", "no", "of", "on", "or", "please", "some",
  "something", "that", "the", "to", "want", "with", "without", "avoid", "exclude", "under",
  "below", "less", "than", "over", "above", "least", "more",
]);
const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  milk: ["milk", "dairy", "cheese", "cream", "butter"],
  egg: ["egg", "eggs"],
  fish: ["fish"],
  shellfish: ["shellfish", "shrimp", "crab"],
  peanuts: ["peanut", "peanuts"],
  "tree nuts": ["tree nut", "tree nuts", "nut", "nuts"],
  soy: ["soy", "soya"],
  wheat: ["wheat"],
  gluten: ["gluten"],
  sesame: ["sesame"],
};
const ALLERGEN_DISPLAY: Record<string, string> = {
  milk: "Milk", egg: "Egg", fish: "Fish", shellfish: "Shellfish", peanuts: "Peanuts",
  "tree nuts": "Tree nuts", soy: "Soy", wheat: "Wheat", gluten: "Gluten", sesame: "Sesame",
};
const VEGETABLE_SIGNALS = [
  "spring mix", "leafy green", "arugula", "spinach", "kale", "romaine", "mixed greens",
  "baby greens", "collard", "chard", "lettuce", "cabbage", "broccoli", "cauliflower", "zucchini",
  "squash", "carrot", "beet", "asparagus", "green bean", "edamame", "pea", "corn", "cucumber",
  "tomato", "pepper", "onion", "mushroom", "eggplant", "artichoke", "brussels sprout", "bok choy",
  "leek", "celery", "radish", "turnip", "parsnip", "fennel", "okra", "snap pea", "snow pea",
  "watercress", "endive", "radicchio", "swiss chard",
];
const SOFT_QUERY_EXPANSIONS: [RegExp, string][] = [
  [/\bvegetables?\b/g, "vegetables greens leafy produce"],
  [/\bveggies?\b/g, "vegetables greens leafy produce"],
  [/\bgreens\b/g, "greens leafy vegetables salad"],
  [/\bsalad\b/g, "salad greens leafy vegetables"],
];
const PROCESSED_SUBSTITUTE_SIGNALS = [
  "fillet", "burger", "nugget", "sausage", "patty", "bacon", "chicken", "beef", "pork", "fish",
  "steak", "meatball", "wing", "rib", "drumstick", "tender", "strip", "schnitzel", "cutlet",
];
const NUMERIC_KEYS = [
  "max_calories", "min_calories", "min_protein", "max_sodium", "min_fiber", "max_fat", "max_carbohydrates",
] as const;
type NumericKey = (typeof NUMERIC_KEYS)[number];

interface Intent extends Record<NumericKey, number | null> {
  raw_query: string;
  semantic_query: string;
  terms: string[];
  required_flags: Set<string>;
  excluded_allergens: Set<string>;
  meal_period: string | null;
  soft_preferences: Set<string>;
  has_hard_filters: boolean;
  has_structured_intent: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizeText = (text: string) => text.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ").trim();

function stem(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(text: string): string[] {
  return (normalizeText(text).match(/[a-z][a-z0-9]*/g) ?? []).filter((t) => !STOPWORDS.has(t)).map(stem);
}

const fmt = (n: number) => String(Number(n.toPrecision(6)));

function nutritionText(d: MenuDish): string[] {
  const parts: string[] = [];
  parts.push(`${d.calories} calories`);
  if (d.calories <= 400) parts.push("low calorie");
  else if (d.calories >= 700) parts.push("high calorie");
  parts.push(`${d.protein}g protein`);
  if (d.protein >= 20) parts.push("high protein");
  parts.push(`${d.carbohydrates}g carbohydrates`, `${d.fat}g fat`);
  if (d.fiber !== null) {
    parts.push(`${fmt(d.fiber)}g fiber`);
    if (d.fiber >= 5) parts.push("high fiber");
  }
  if (d.sodium !== null) {
    parts.push(`${fmt(d.sodium)}mg sodium`);
    if (d.sodium <= 500) parts.push("low sodium");
    else if (d.sodium >= 900) parts.push("high sodium");
  }
  return parts;
}

function dishText(d: MenuDish): string {
  const parts = [d.dish_name, d.category, d.course, d.meal_period, d.serving_unit].filter(Boolean);
  parts.push(...(d.dietary_flags ?? []), ...(d.allergens ?? []));
  if (d.nutrition_source) parts.push(...nutritionText(d));
  if (VEGETABLE_SIGNALS.some((s) => normalizeText(d.dish_name).includes(s))) {
    parts.push("vegetables", "vegetable dish", "greens", "produce");
  }
  return parts.join(" ");
}

function semanticQueryText(query: string): string {
  let text = normalizeText(query);
  for (const synonyms of Object.values(ALLERGEN_SYNONYMS)) {
    for (const syn of [...synonyms].sort((a, b) => b.length - a.length)) {
      text = text
        .replace(new RegExp(`\\b(?:without|avoid|exclude|no)\\s+(?:any\\s+)?${esc(syn)}\\b`, "g"), " ")
        .replace(new RegExp(`\\b${esc(syn)}\\s+free\\b`, "g"), " ");
    }
  }
  const numeric = [
    /\b(?:under|below|less than|fewer than|max(?:imum)?|no more than|at most)\s*\d+\s*(?:calories|calorie|cal|kcal|mg|g)?\b/g,
    /\b(?:over|above|at least|min(?:imum)?|more than)\s*\d+\s*(?:calories|calorie|cal|kcal|mg|g)?\b/g,
    /\b\d+\s*(?:calories|calorie|cal|kcal|mg|g)\s*(?:or less|or more|and under|and over)?\b/g,
  ];
  for (const re of numeric) text = text.replace(re, " ");
  for (const [re, expansion] of SOFT_QUERY_EXPANSIONS) text = text.replace(re, expansion);
  text = text.replace(/\s+/g, " ").trim();
  return text || query.trim();
}

function firstNumber(patterns: RegExp[], text: string): number | null {
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return Number(m[1]);
  }
  return null;
}

function addExcludedAllergen(intent: Intent, canonical: string) {
  if (canonical === "gluten") ["gluten", "wheat"].forEach((a) => intent.excluded_allergens.add(a));
  else if (canonical === "tree nuts") ["tree nuts", "peanuts"].forEach((a) => intent.excluded_allergens.add(a));
  else intent.excluded_allergens.add(canonical);
}

export function parseQueryIntent(query: string): Intent {
  const text = query.trim();
  const n = normalizeText(text);
  const intent: Intent = {
    raw_query: text,
    semantic_query: semanticQueryText(text),
    terms: tokenize(text),
    required_flags: new Set(),
    excluded_allergens: new Set(),
    meal_period: null,
    soft_preferences: new Set(),
    max_calories: null, min_calories: null, min_protein: null, max_sodium: null,
    min_fiber: null, max_fat: null, max_carbohydrates: null,
    has_hard_filters: false,
    has_structured_intent: false,
  };
  if (/\bvegan\b/.test(n)) intent.required_flags.add("vegan");
  else if (/\bvegetarian\b/.test(n)) intent.required_flags.add("vegetarian");
  for (const period of ["breakfast", "lunch", "dinner", "brunch"]) {
    if (new RegExp(`\\b${period}\\b`).test(n)) {
      intent.meal_period = period;
      break;
    }
  }
  for (const [canonical, synonyms] of Object.entries(ALLERGEN_SYNONYMS)) {
    for (const syn of synonyms) {
      if (
        new RegExp(`\\b(?:without|avoid|exclude|no)\\s+(?:any\\s+)?${esc(syn)}\\b`).test(n) ||
        new RegExp(`\\b${esc(syn)}\\s+free\\b`).test(n)
      ) addExcludedAllergen(intent, canonical);
    }
  }

  const LT = "(?:under|below|less than|fewer than|max(?:imum)?|no more than|at most)";
  const LT2 = "(?:under|below|less than|max(?:imum)?|no more than|at most)";
  const GT = "(?:over|above|at least|min(?:imum)?|more than)";
  const CAL = "(?:calories|calorie|cal|kcal)";
  const re = (s: string) => new RegExp(s);
  intent.max_calories = firstNumber([re(`\\b${LT}\\s*(\\d+)\\s*${CAL}\\b`), re(`\\b(\\d+)\\s*${CAL}\\s*(?:or less|and under|max)\\b`)], n);
  intent.min_calories = firstNumber([re(`\\b${GT}\\s*(\\d+)\\s*${CAL}\\b`), re(`\\b(\\d+)\\s*${CAL}\\s*(?:or more|and over|min)\\b`)], n);
  intent.min_protein = firstNumber([re(`\\b${GT}\\s*(\\d+)\\s*g?\\s*(?:of\\s+)?protein\\b`), re(`\\b(\\d+)\\s*g?\\s*protein\\s*(?:or more|minimum|min)?\\b`)], n);
  intent.max_sodium = firstNumber([re(`\\b${LT2}\\s*(\\d+)\\s*mg\\s*sodium\\b`), re(`\\b(\\d+)\\s*mg\\s*sodium\\s*(?:or less|and under|max)\\b`)], n);
  intent.min_fiber = firstNumber([re(`\\b${GT}\\s*(\\d+)\\s*g?\\s*(?:of\\s+)?fiber\\b`), re(`\\b(\\d+)\\s*g?\\s*fiber\\s*(?:or more|minimum|min)?\\b`)], n);
  intent.max_fat = firstNumber([re(`\\b${LT2}\\s*(\\d+)\\s*g?\\s*(?:of\\s+)?fat\\b`), re(`\\b(\\d+)\\s*g?\\s*fat\\s*(?:or less|and under|max)\\b`)], n);
  intent.max_carbohydrates = firstNumber([re(`\\b${LT2}\\s*(\\d+)\\s*g?\\s*(?:carbs|carbohydrates)\\b`), re(`\\b(\\d+)\\s*g?\\s*(?:carbs|carbohydrates)\\s*(?:or less|and under|max)\\b`)], n);

  const prefs = intent.soft_preferences;
  if (/\b(low calorie|low calories|low cal|light|lighter|healthy|lean)\b/.test(n)) prefs.add("low_calorie");
  if (/\b(high protein|protein|post workout|recovery)\b/.test(n)) prefs.add("high_protein");
  if (/\b(high fiber|fiber|filling|satiating|full)\b/.test(n)) prefs.add("high_fiber");
  if (/\b(low sodium|heart healthy)\b/.test(n)) prefs.add("low_sodium");
  if (/\b(low fat|lean)\b/.test(n)) prefs.add("low_fat");
  if (/\b(low carb|low carbohydrate)\b/.test(n)) prefs.add("low_carb");
  if (/\b(filling|satiating|full)\b/.test(n)) prefs.add("filling");
  if (/\b(vegetable|vegetables|veggie|veggies|greens|salad|plant forward|plant based)\b/.test(n)) prefs.add("plant_forward");
  if (/\b(healthy|balanced)\b/.test(n)) ["low_calorie", "high_fiber", "low_sodium"].forEach((p) => prefs.add(p));
  if (intent.max_calories !== null) prefs.add("low_calorie");
  if (intent.min_protein !== null) prefs.add("high_protein");
  if (intent.max_sodium !== null) prefs.add("low_sodium");
  if (intent.min_fiber !== null) prefs.add("high_fiber");
  if (intent.max_fat !== null) prefs.add("low_fat");
  if (intent.max_carbohydrates !== null) prefs.add("low_carb");
  if (intent.required_flags.size) prefs.add("dietary_fit");
  if (intent.meal_period) prefs.add("meal_period");

  intent.has_hard_filters =
    intent.required_flags.size > 0 ||
    intent.excluded_allergens.size > 0 ||
    Boolean(intent.meal_period) ||
    NUMERIC_KEYS.some((k) => intent[k] !== null);
  intent.has_structured_intent = intent.has_hard_filters || prefs.size > 0;
  return intent;
}

const num = (v: number | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

function hasNutrition(d: MenuDish): boolean {
  return Boolean(d.nutrition_source) || [d.calories, d.protein, d.carbohydrates, d.fat, d.fiber, d.sodium].some((v) => num(v) > 0);
}

function hasFlag(d: MenuDish, flag: string): boolean {
  const flags = new Set((d.dietary_flags ?? []).map(normalizeText));
  return flag === "vegetarian" ? flags.has("vegetarian") || flags.has("vegan") : flags.has(flag);
}

function normalizedAllergens(d: MenuDish): Set<string> {
  const out = new Set<string>();
  for (const a of d.allergens ?? []) {
    const v = normalizeText(String(a));
    out.add(v);
    for (const [canonical, synonyms] of Object.entries(ALLERGEN_SYNONYMS)) if (synonyms.includes(v)) out.add(canonical);
  }
  return out;
}

function matchesHardFilters(d: MenuDish, intent: Intent): boolean {
  if (NUMERIC_KEYS.some((k) => intent[k] !== null) && !hasNutrition(d)) return false;
  if (intent.meal_period && !normalizeText(d.meal_period ?? "").includes(intent.meal_period)) return false;
  for (const flag of intent.required_flags) if (!hasFlag(d, flag)) return false;
  const allergens = normalizedAllergens(d);
  if ([...intent.excluded_allergens].some((a) => allergens.has(a))) return false;
  if (intent.max_calories !== null && num(d.calories) > intent.max_calories) return false;
  if (intent.min_calories !== null && num(d.calories) < intent.min_calories) return false;
  if (intent.min_protein !== null && num(d.protein) < intent.min_protein) return false;
  if (intent.max_sodium !== null && num(d.sodium) > intent.max_sodium) return false;
  if (intent.min_fiber !== null && num(d.fiber) < intent.min_fiber) return false;
  if (intent.max_fat !== null && num(d.fat) > intent.max_fat) return false;
  if (intent.max_carbohydrates !== null && num(d.carbohydrates) > intent.max_carbohydrates) return false;
  return true;
}

function lowIsBetter(value: number, ideal: number, worst: number): number {
  if (value <= 0) return 0;
  if (value <= ideal) return 1;
  if (value >= worst) return 0;
  return (worst - value) / (worst - ideal);
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function nutritionFit(d: MenuDish, intent: Intent): [number, string[]] {
  const p = intent.soft_preferences;
  const scores: number[] = [];
  const reasons: string[] = [];
  if (p.has("low_calorie")) {
    scores.push(lowIsBetter(num(d.calories), 400, 800));
    if (num(d.calories) > 0 && num(d.calories) <= 400) reasons.push(`Low calorie: ${Math.trunc(num(d.calories))} calories`);
  }
  if (p.has("high_protein")) {
    scores.push(Math.min(num(d.protein) / 25, 1));
    if (num(d.protein) >= 20) reasons.push(`High protein: ${Math.trunc(num(d.protein))}g`);
  }
  if (p.has("high_fiber")) {
    scores.push(Math.min(num(d.fiber) / 8, 1));
    if (num(d.fiber) >= 5) reasons.push(`High fiber: ${fmt(num(d.fiber))}g`);
  }
  if (p.has("low_sodium")) {
    scores.push(lowIsBetter(num(d.sodium), 500, 1200));
    if (num(d.sodium) > 0 && num(d.sodium) <= 500) reasons.push(`Low sodium: ${fmt(num(d.sodium))}mg`);
  }
  if (p.has("low_fat")) {
    scores.push(lowIsBetter(num(d.fat), 10, 30));
    if (num(d.fat) > 0 && num(d.fat) <= 10) reasons.push(`Low fat: ${Math.trunc(num(d.fat))}g`);
  }
  if (p.has("low_carb")) {
    scores.push(lowIsBetter(num(d.carbohydrates), 30, 80));
    if (num(d.carbohydrates) > 0 && num(d.carbohydrates) <= 30) reasons.push(`Lower carb: ${Math.trunc(num(d.carbohydrates))}g`);
  }
  if (p.has("filling")) {
    const ps = Math.min(num(d.protein) / 25, 1);
    const fs = Math.min(num(d.fiber) / 8, 1);
    scores.push((ps + fs) / 2);
    if (ps >= 0.8 || fs >= 0.6) reasons.push("Filling protein/fiber profile");
  }
  return [scores.length ? mean(scores) : 0, reasons];
}

function lexicalFit(d: MenuDish, intent: Intent): [number, string[]] {
  const terms = intent.terms.filter((t) => !/^\d+$/.test(t));
  if (!terms.length) return [0, []];
  const dishTerms = new Set(tokenize(dishText(d)));
  const matched = [...new Set(terms.filter((t) => dishTerms.has(t)))].sort();
  if (!matched.length) return [0, []];
  return [Math.min(matched.length / Math.max(new Set(terms).size, 1), 1), [`Text match: ${matched.slice(0, 3).join(", ")}`]];
}

function dietaryFit(d: MenuDish, intent: Intent): [number, string[]] {
  const scores: number[] = [];
  const reasons: string[] = [];
  for (const flag of intent.required_flags) {
    if (hasFlag(d, flag)) {
      scores.push(1);
      reasons.push(flag.charAt(0).toUpperCase() + flag.slice(1));
    } else scores.push(0);
  }
  if (intent.excluded_allergens.size) {
    const allergens = normalizedAllergens(d);
    if (![...intent.excluded_allergens].some((a) => allergens.has(a))) {
      scores.push(1);
      const excluded = [...intent.excluded_allergens].sort().map((a) => ALLERGEN_DISPLAY[a] ?? a);
      reasons.push(`No listed ${excluded.slice(0, 2).join(", ")} allergen`);
    } else scores.push(0);
  }
  if (intent.soft_preferences.has("plant_forward")) {
    const text = normalizeText(dishText(d));
    let plant = ["vegetable", "veggie", "greens", "salad", "plant", "vegan", "vegetarian"].some((t) => text.includes(t)) ? 1 : 0;
    if (hasFlag(d, "vegetarian")) plant = Math.max(plant, 0.8);
    if (PROCESSED_SUBSTITUTE_SIGNALS.some((s) => normalizeText(d.dish_name).includes(s))) plant *= 0.3;
    scores.push(plant);
    if (plant > 0.4) reasons.push("Plant-forward match");
  }
  if (intent.meal_period) {
    const match = normalizeText(d.meal_period ?? "").includes(intent.meal_period);
    scores.push(match ? 1 : 0);
    if (match) reasons.push(`${intent.meal_period.charAt(0).toUpperCase()}${intent.meal_period.slice(1)} option`);
  }
  return [scores.length ? mean(scores) : 0, reasons];
}

function weights(intent: Intent) {
  if (!intent.has_structured_intent) return { semantic: 0.85, nutrition: 0, lexical: 0.15, dietary: 0 };
  const nutritionPrefs = ["low_calorie", "high_protein", "high_fiber", "low_sodium", "low_fat", "low_carb", "filling"];
  if (nutritionPrefs.some((p) => intent.soft_preferences.has(p))) return { semantic: 0.35, nutrition: 0.45, lexical: 0.1, dietary: 0.1 };
  if (intent.required_flags.size || intent.excluded_allergens.size) return { semantic: 0.4, nutrition: 0.1, lexical: 0.15, dietary: 0.35 };
  return { semantic: 0.55, nutrition: 0.15, lexical: 0.2, dietary: 0.1 };
}

/* ── Query embedding (lazy-loaded transformers.js) ── */

type Extractor = (text: string, options: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array }>;
let extractorPromise: Promise<Extractor> | null = null;

function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = import("@huggingface/transformers").then(
      async ({ pipeline }) => (await pipeline("feature-extraction", MODEL_ID)) as unknown as Extractor,
    );
    extractorPromise.catch(() => {
      extractorPromise = null;
    });
  }
  return extractorPromise;
}

async function embedQuery(text: string): Promise<Float32Array | null> {
  try {
    const extractor = await getExtractor();
    return (await extractor(text, { pooling: "mean", normalize: true })).data;
  } catch {
    return null;
  }
}

let vectorCache: Promise<Map<number, Float32Array>> | null = null;

function getVectors(): Promise<Map<number, Float32Array>> {
  if (!vectorCache) {
    vectorCache = getEmbeddings().then(({ vectors }) => {
      const map = new Map<number, Float32Array>();
      for (const { id, s, q } of vectors) {
        const bytes = Uint8Array.from(atob(q), (c) => c.charCodeAt(0));
        const ints = new Int8Array(bytes.buffer);
        const vec = Float32Array.from(ints, (v) => (v / 127) * s);
        const norm = Math.hypot(...vec) || 1;
        map.set(id, vec.map((v) => v / norm));
      }
      return map;
    });
    vectorCache.catch(() => {
      vectorCache = null;
    });
  }
  return vectorCache;
}

const dot = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};

export const semanticSearch: Handler = async (req) => {
  const query = (req.query.get("q") ?? "").trim();
  if (!query) return fail(400, "Query parameter 'q' is required.");
  if (query.length > 200) return fail(400, "Query must be 200 characters or fewer.");
  const hallId = req.query.get("hall");
  const topK = Math.min(Number(req.query.get("top_k") ?? 10) || 10, 20);

  const [{ todayDishes, menu }, vectors] = await Promise.all([getCatalog(), getVectors().catch(() => new Map<number, Float32Array>())]);
  const intent = parseQueryIntent(query);

  const scoped = (pool: MenuDish[]) => pool.filter((d) => !hallId || String(d.dining_hall) === hallId);
  let base = scoped(todayDishes).filter((d) => vectors.has(d.dish_id));
  let usingDateFallback = false;
  if (!base.length) {
    base = scoped(menu.dishes)
      .filter((d) => vectors.has(d.dish_id))
      .sort((a, b) => (b.last_seen ?? "").localeCompare(a.last_seen ?? "") || a.dish_id - b.dish_id);
    usingDateFallback = true;
  }
  const noEmbeddings = base.length === 0;
  if (noEmbeddings) base = scoped(todayDishes);
  if (!base.length) return ok({ results: [], count: 0, query, no_embeddings: noEmbeddings });

  let candidates = base.filter((d) => matchesHardFilters(d, intent));
  let relaxed = false;
  if (!candidates.length) {
    candidates = base;
    relaxed = intent.has_hard_filters;
  }

  const queryVec = await embedQuery(intent.semantic_query);
  const w = weights(intent);
  const scored = candidates.map((d) => {
    const vec = vectors.get(d.dish_id);
    const semantic = queryVec && vec ? dot(queryVec, vec) : 0;
    const [nutrition, nReasons] = nutritionFit(d, intent);
    const [lexical, lReasons] = lexicalFit(d, intent);
    const [dietary, dReasons] = dietaryFit(d, intent);
    const score = w.semantic * Math.max(0, semantic) + w.nutrition * nutrition + w.lexical * lexical + w.dietary * dietary;
    const reasons = [
      ...(relaxed ? ["No exact constraint match; showing closest options"] : []),
      ...(semantic >= 0.45 ? ["Semantically close to your search"] : []),
      ...nReasons,
      ...dReasons,
      ...lReasons,
    ];
    return {
      dish: d,
      score: Number(score.toFixed(6)),
      semantic_score: Number(semantic.toFixed(6)),
      nutrition_score: Number(nutrition.toFixed(6)),
      lexical_score: Number(lexical.toFixed(6)),
      dietary_score: Number(dietary.toFixed(6)),
      match_reasons: [...new Set(reasons)].slice(0, 4),
    };
  });
  scored.sort((a, b) => b.score - a.score);

  // Without the embedding model, only lexical/nutrition signals count, so don't threshold them away.
  const threshold = queryVec ? MIN_SCORE : 0.01;
  let kept = scored.filter((s) => s.score >= threshold);
  const plantForward = intent.soft_preferences.has("plant_forward");
  if (!kept.length && (relaxed || plantForward || !queryVec)) kept = scored;
  else if (plantForward && kept.length < topK) {
    const included = new Set(kept);
    kept = [...kept, ...scored.filter((s) => !included.has(s)).slice(0, topK - kept.length)];
  }

  const results = kept.slice(0, topK).map(({ dish: d, ...info }) => ({
    dish_id: d.dish_id,
    dish_name: d.dish_name,
    ...info,
    constraints_relaxed: relaxed,
    using_date_fallback: usingDateFallback,
    calories: d.calories,
    protein: d.protein,
    carbohydrates: d.carbohydrates,
    fat: d.fat,
    fiber: d.fiber,
    sodium: d.sodium,
    category: d.category,
    allergens: d.allergens,
    dietary_flags: d.dietary_flags,
    serving_unit: d.serving_unit,
    serving_size: d.serving_size,
    course: d.course,
    meal_period: d.meal_period,
    nutrition_source: d.nutrition_source,
    ai_confidence: d.ai_confidence,
  }));
  return ok({ results, count: results.length, query, no_embeddings: noEmbeddings });
};
