/**
 * AI features: chat (via the /api/chat serverless function, with an offline
 * fallback), conversation history, daily recommendations, nutrition estimates
 * and analytics events.
 */
import axios from "axios";
import {
  buildMenuContext,
  buildOfflineResponse,
  type ChatResult,
  type HistoryItem,
  type UserContext,
} from "../../lib/chatCore";
import { localDate, mutate, readDb, userForToken, type LocalUser } from "../db";
import { getCatalog } from "../staticData";
import { bodyObject, fail, isResponse, ok, requireUser, type Handler, type LocalRequest } from "../http";

export const CHAT_FUNCTION_URL = "/api/chat";
const MAX_HISTORY = 16;

/* ── Analytics helpers (ports of views._bucket_for_prompt_chars etc.) ── */

function bucketFor(chars: number): string {
  if (chars <= 50) return "0-50";
  if (chars <= 150) return "51-150";
  if (chars <= 300) return "151-300";
  return "301+";
}

function estimateTokens(text: string): number {
  const chars = text.trim().length;
  return chars ? Math.max(1, Math.round(chars / 4)) : 0;
}

function ratesFor(model: string): [number, number] {
  const m = model.toLowerCase();
  if (m.includes("gemini-3")) return [0.5, 3.0];
  if (m.includes("lite")) return [0.1, 0.4];
  if (m.includes("flash")) return [0.3, 2.5];
  return [0.1, 0.4];
}

export function inferIntent(message: string): string {
  const lower = message.toLowerCase();
  if (["protein", "post-workout", "muscle", "macro"].some((t) => lower.includes(t))) return "high_protein";
  if (["vegetarian", "vegan", "plant"].some((t) => lower.includes(t))) return "vegetarian";
  if (["allergy", "allergen", "gluten", "dairy", "peanut", "nut"].some((t) => lower.includes(t))) return "allergy";
  if (["low carb", "carb", "keto"].some((t) => lower.includes(t))) return "low_carb";
  if (["calorie", "under", "light"].some((t) => lower.includes(t))) return "calorie_control";
  return "general";
}

function logEvent(fields: {
  event_type: string;
  user: LocalUser | null;
  session_id?: string;
  message?: string;
  latency_ms?: number;
  success?: boolean;
  model_name?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
}) {
  const message = (fields.message ?? "").trim();
  const prompt = fields.prompt_tokens ?? 0;
  const completion = fields.completion_tokens ?? 0;
  const [inRate, outRate] = ratesFor(fields.model_name ?? "");
  mutate((db) => {
    db.events.push({
      timestamp: new Date().toISOString(),
      event_type: fields.event_type,
      user: fields.user?.id ?? null,
      session_id: (fields.session_id ?? "").slice(0, 64),
      prompt_chars: message.length,
      prompt_text_redacted: message.slice(0, 240),
      input_bucket: message ? bucketFor(message.length) : "",
      intent_label: message ? inferIntent(message) : "general",
      latency_ms: Math.max(0, Math.round(fields.latency_ms ?? 0)),
      success: fields.success ?? true,
      model_name: fields.model_name ?? "",
      total_tokens: prompt + completion,
      estimated_cost_usd: (prompt / 1e6) * inRate + (completion / 1e6) * outRate,
    });
  });
}

/* ── User context for the prompt (port of AIChatView._extract_user_context) ── */

function sanitizeTray(raw: unknown) {
  if (!raw || typeof raw !== "object") return null;
  const tray = raw as Record<string, unknown>;
  const int = (v: unknown) => Math.trunc(Number(v) || 0);
  const items = (Array.isArray(tray.items) ? tray.items : [])
    .slice(0, 8)
    .filter((i): i is Record<string, unknown> => Boolean(i && typeof i === "object" && String((i as Record<string, unknown>).dish_name ?? "").trim()))
    .map((i) => ({
      dish_id: i.dish_id,
      dish_name: String(i.dish_name).trim(),
      hall: String(i.hall ?? "").trim(),
      quantity: Math.max(1, int(i.quantity) || 1),
      calories: int(i.calories),
      protein: int(i.protein),
      carbohydrates: int(i.carbohydrates),
      fat: int(i.fat),
      serving_size: String(i.serving_size ?? "").trim(),
    }));
  const totals = (tray.totals && typeof tray.totals === "object" ? tray.totals : {}) as Record<string, unknown>;
  return {
    item_count: int(tray.item_count),
    unique_dishes: tray.unique_dishes !== undefined ? int(tray.unique_dishes) : items.length,
    totals: {
      calories: int(totals.calories),
      protein: int(totals.protein),
      carbohydrates: int(totals.carbohydrates),
      fat: int(totals.fat),
    },
    items,
  };
}

function buildUserContext(user: LocalUser | null, trayContext: unknown): UserContext {
  const context: UserContext = {};
  if (user) {
    const p = user.profile;
    const name = `${user.first_name} ${user.last_name}`.trim();
    if (name) context.name = name;
    if (p.goal) context.goal = p.goal;
    if (p.activity_level) context.activity_level = p.activity_level;
    if (p.sex) context.sex = p.sex;
    if (p.age !== null) context.age = p.age;
    if (p.height_cm !== null) context.height_cm = String(p.height_cm);
    if (p.weight_kg !== null) context.weight_kg = String(p.weight_kg);

    const goalsSet = p.daily_cal_goal !== null;
    if (goalsSet) {
      context.daily_goals = {
        calories: p.daily_cal_goal ?? 0,
        protein: p.daily_protein_goal ?? 0,
        carbohydrates: p.daily_carbs_goal ?? 0,
        fat: p.daily_fat_goal ?? 0,
      };
    }
    const today = localDate();
    const meals = readDb()
      .meals.filter((m) => m.user === user.id && m.date === today)
      .sort((a, b) => b.meal_id - a.meal_id);
    const logged = {
      calories: meals.reduce((s, m) => s + m.total_calories, 0),
      protein: meals.reduce((s, m) => s + m.total_protein, 0),
      carbohydrates: meals.reduce((s, m) => s + m.total_carbohydrates, 0),
      fat: meals.reduce((s, m) => s + m.total_fat, 0),
    };
    context.today_logged_totals = logged;
    if (goalsSet) {
      context.today_remaining_goals = {
        calories: Math.max(0, (p.daily_cal_goal ?? 0) - logged.calories),
        protein: Math.max(0, (p.daily_protein_goal ?? 0) - logged.protein),
        carbohydrates: Math.max(0, (p.daily_carbs_goal ?? 0) - logged.carbohydrates),
        fat: Math.max(0, (p.daily_fat_goal ?? 0) - logged.fat),
      };
    }
    if (meals.length) {
      context.logged_meals_today = meals.slice(0, 5).map((m) => ({
        category: m.category || "Logged Meal",
        calories: m.total_calories,
        protein: m.total_protein,
        carbohydrates: m.total_carbohydrates,
        fat: m.total_fat,
        dishes: m.dishes.slice(0, 5).map((d) => d.dish_name),
      }));
    }
  }
  const tray = sanitizeTray(trayContext);
  if (tray) context.current_meal_tray = tray;
  return context;
}

/* ── Chat ── */

async function askModel(
  req: LocalRequest,
  message: string,
  history: HistoryItem[],
  userContext: UserContext,
): Promise<ChatResult> {
  try {
    const { data } = await axios.post<ChatResult>(
      CHAT_FUNCTION_URL,
      { message, history, user_context: userContext },
      { signal: req.signal, timeout: 30000 },
    );
    if (!data || typeof data.response !== "string") throw new Error("Bad response");
    return data;
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    // Quota hit, no API key, or offline: answer from the menu data directly.
    const { menu } = await getCatalog();
    return buildOfflineResponse(message, userContext, buildMenuContext(menu, message, userContext));
  }
}

export const aiChat: Handler = async (req) => {
  const started = performance.now();
  const user = userForToken(req.token);
  const body = bodyObject(req);
  const message = String(body.message ?? "").trim();
  const sessionId = String(body.session_id ?? "").trim();
  if (!message) {
    logEvent({ event_type: "ai_chat_request", user, session_id: sessionId, success: false, model_name: "unknown" });
    return fail(400, "Message is required");
  }

  let history: HistoryItem[] = Array.isArray(body.history) ? (body.history as HistoryItem[]) : [];
  let convoId: number | null = null;

  if (user) {
    const requestedId = body.conversation_id === null || body.conversation_id === undefined ? null : Number(body.conversation_id);
    const db = readDb();
    if (requestedId !== null && !db.conversations.some((c) => c.id === requestedId && c.user === user.id)) {
      return fail(404, "Conversation not found");
    }
    convoId = mutate((d) => {
      let convo = requestedId !== null ? d.conversations.find((c) => c.id === requestedId) : undefined;
      if (!convo) {
        d.seq.convo += 1;
        convo = { id: d.seq.convo, user: user.id, title: "New chat", updated_at: new Date().toISOString(), messages: [] };
        d.conversations.push(convo);
      }
      if (body.regenerate) {
        const lastAssistant = [...convo.messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) convo.messages = convo.messages.filter((m) => m !== lastAssistant);
      } else {
        d.seq.message += 1;
        convo.messages.push({ id: d.seq.message, role: "user", content: message, metadata: {}, created_at: new Date().toISOString() });
      }
      if (convo.title === "New chat") {
        const first = convo.messages.find((m) => m.role === "user");
        if (first) convo.title = first.content.slice(0, 80);
      }
      convo.updated_at = new Date().toISOString();
      return convo.id;
    });
    const convo = readDb().conversations.find((c) => c.id === convoId)!;
    history = convo.messages.map((m) => ({ role: m.role, content: m.content }));
  }

  const userContext = buildUserContext(user, body.tray_context);
  const result = await askModel(req, message, history.slice(-MAX_HISTORY), userContext);
  const meta = result._meta ?? { model_name: "unknown", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  logEvent({
    event_type: "ai_chat_request",
    user,
    session_id: sessionId,
    message,
    latency_ms: performance.now() - started,
    success: true,
    model_name: meta.model_name,
    prompt_tokens: meta.prompt_tokens || estimateTokens(message),
    completion_tokens: meta.completion_tokens || estimateTokens(result.response),
  });

  const payload: Record<string, unknown> = {
    response: result.response,
    recommended_dishes: result.recommended_dishes,
    follow_up_suggestions: result.follow_up_suggestions,
  };
  if (result.meal_plan) payload.meal_plan = result.meal_plan;

  if (user && convoId !== null) {
    const title = mutate((d) => {
      const convo = d.conversations.find((c) => c.id === convoId)!;
      d.seq.message += 1;
      const metadata: Record<string, unknown> = {};
      for (const key of ["recommended_dishes", "meal_plan", "follow_up_suggestions"]) {
        if (payload[key] !== undefined && payload[key] !== null) metadata[key] = payload[key];
      }
      convo.messages.push({ id: d.seq.message, role: "assistant", content: result.response, metadata, created_at: new Date().toISOString() });
      convo.updated_at = new Date().toISOString();
      return convo.title;
    });
    payload.conversation_id = convoId;
    payload.title = title;
  }
  return ok(payload);
};

/* ── Conversations ── */

export const listConversations: Handler = (req) => {
  const user = userForToken(req.token);
  if (!user) return fail(401, "Authentication required");
  return ok(
    readDb()
      .conversations.filter((c) => c.user === user.id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map((c) => ({ id: c.id, title: c.title, updated_at: c.updated_at, message_count: c.messages.length })),
  );
};

export const createConversation: Handler = (req) => {
  const user = userForToken(req.token);
  if (!user) return fail(401, "Authentication required");
  const convo = mutate((d) => {
    d.seq.convo += 1;
    const c = { id: d.seq.convo, user: user.id, title: "New chat", updated_at: new Date().toISOString(), messages: [] };
    d.conversations.push(c);
    return c;
  });
  return ok({ id: convo.id, title: convo.title, updated_at: convo.updated_at, message_count: 0 }, 201);
};

function ownConversation(req: LocalRequest, id: string) {
  const user = userForToken(req.token);
  if (!user) return fail(401, "Authentication required");
  const convo = readDb().conversations.find((c) => c.id === Number(id) && c.user === user.id);
  return convo ?? fail(404, "Not found");
}

export const getConversation: Handler = (req, [id]) => {
  const convo = ownConversation(req, id);
  if (isResponse(convo)) return convo;
  return ok({ id: convo.id, title: convo.title, updated_at: convo.updated_at, messages: convo.messages });
};

export const renameConversation: Handler = (req, [id]) => {
  const convo = ownConversation(req, id);
  if (isResponse(convo)) return convo;
  const title = String(bodyObject(req).title ?? "").trim();
  if (!title) return fail(400, "Title cannot be empty");
  const updated = mutate((d) => {
    const c = d.conversations.find((x) => x.id === convo.id)!;
    c.title = title.slice(0, 80);
    c.updated_at = new Date().toISOString();
    return c;
  });
  return ok({ id: updated.id, title: updated.title, updated_at: updated.updated_at });
};

export const deleteConversation: Handler = (req, [id]) => {
  const convo = ownConversation(req, id);
  if (isResponse(convo)) return convo;
  mutate((d) => {
    d.conversations = d.conversations.filter((c) => c.id !== convo.id);
  });
  return ok({}, 204);
};

/* ── Daily recommendations (port of the rule-based recommendation payload) ── */

export const aiRecommend: Handler = async (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return { status: 401, data: { error: "Authentication required" } };
  const body = bodyObject(req);
  const goal = user.profile.goal || "maintain";
  const dietaryFlags = Array.isArray(body.dietary_flags) ? body.dietary_flags : [];
  const signature = JSON.stringify({ dietary_flags: dietaryFlags, goal });
  const today = localDate();

  const cached = readDb().recommendations[String(user.id)];
  if (!body.force && cached && cached.date === today && cached.signature === signature && cached.recommendations.length) {
    return ok({ recommendations: cached.recommendations, tip: cached.tip, cached: true, snapshot_date: today, generated_at: cached.generated_at });
  }

  const { todayDishes, menu, hallsById } = await getCatalog();
  const hallName = (id: number) => hallsById.get(id)?.name ?? "";
  let dishes = [...todayDishes]
    .sort((a, b) => a.dining_hall - b.dining_hall || a.dish_name.localeCompare(b.dish_name))
    .slice(0, 30);
  if (!dishes.length) {
    dishes = [...menu.dishes].sort((a, b) => b.protein - a.protein || a.dish_name.localeCompare(b.dish_name)).slice(0, 30);
  }

  let ranked = [...dishes];
  let tip = "Pick a protein source first, then round it out with vegetables or grains.";
  if (goal === "fat_loss") {
    ranked.sort((a, b) => b.protein - a.protein || a.calories - b.calories || a.dish_name.localeCompare(b.dish_name));
    tip = "Prioritize the higher-protein, lower-calorie choices first today.";
  } else if (goal === "muscle_gain") {
    ranked.sort((a, b) => b.protein - a.protein || b.calories - a.calories || a.dish_name.localeCompare(b.dish_name));
    tip = "Build meals around protein-dense entrees and add carbs if you need more energy.";
  } else {
    ranked.sort((a, b) => b.protein - a.protein || a.dish_name.localeCompare(b.dish_name));
  }
  ranked = ranked.slice(0, 3);

  const recommendations = ranked.map((d) => ({
    dish_id: d.dish_id,
    dish_name: d.dish_name,
    hall_name: hallName(d.dining_hall),
    reason: `${d.protein}g protein, ${d.calories} kcal, ${d.carbohydrates}g carbs, ${d.fat}g fat.`,
    calories: d.calories,
    meal_period: d.meal_period,
  }));
  const generatedAt = new Date().toISOString();
  mutate((d) => {
    d.recommendations[String(user.id)] = { date: today, signature, recommendations, tip, generated_at: generatedAt };
  });
  return ok({ recommendations, tip, cached: false, snapshot_date: today, generated_at: generatedAt });
};

/* ── Nutrition target estimate (Mifflin-St Jeor; the local LLM path needed a GPU-class host) ── */

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};
const GOAL_ADJUSTMENTS: Record<string, number> = { fat_loss: -500, muscle_gain: 300, maintain: 0 };
const MACRO_RATIOS: Record<string, { protein: number; carbs: number; fat: number }> = {
  fat_loss: { protein: 0.35, carbs: 0.35, fat: 0.3 },
  muscle_gain: { protein: 0.3, carbs: 0.45, fat: 0.25 },
  maintain: { protein: 0.25, carbs: 0.5, fat: 0.25 },
};

export const nutritionEstimate: Handler = (req) => {
  const body = bodyObject(req);
  const errors: string[] = [];
  const num = (key: string, lo: number, hi: number) => {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") {
      errors.push(`'${key}' is required`);
      return 0;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) errors.push(`'${key}' must be a number`);
    else if (value < lo || value > hi) errors.push(`'${key}' must be between ${lo} and ${hi}`);
    return value;
  };
  const choice = (key: string, valid: string[]) => {
    const value = String(body[key] ?? "").trim().toLowerCase();
    if (!value) errors.push(`'${key}' is required`);
    else if (!valid.includes(value)) errors.push(`'${key}' must be one of: ${[...valid].sort().join(", ")}`);
    return value;
  };
  const age = Math.trunc(num("age", 10, 120));
  const sex = choice("sex", ["male", "female"]);
  const weight = num("weight_kg", 20, 500);
  const height = num("height_cm", 50, 300);
  const activity = choice("activity_level", Object.keys(ACTIVITY_MULTIPLIERS));
  const goal = choice("goal", Object.keys(GOAL_ADJUSTMENTS));
  if (errors.length) return { status: 400, data: { errors } };

  const bmr = Math.round(10 * weight + 6.25 * height - 5 * age + (sex === "male" ? 5 : -161));
  const tdee = Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
  const calories = Math.max(1200, tdee + GOAL_ADJUSTMENTS[goal]);
  const ratios = MACRO_RATIOS[goal];
  return ok({
    bmr,
    tdee,
    recommended_calories: calories,
    macros: {
      protein_g: Math.round((calories * ratios.protein) / 4),
      carbs_g: Math.round((calories * ratios.carbs) / 4),
      fat_g: Math.round((calories * ratios.fat) / 9),
    },
    activity_level: activity,
    goal,
    model: "the Mifflin-St Jeor equation",
    used_fallback: false,
  });
};

/* ── Client analytics events ── */

export const analyticsEvent: Handler = (req) => {
  const user = requireUser(req);
  if (isResponse(user)) return user;
  const body = bodyObject(req);
  const eventType = String(body.event_type ?? "").trim();
  if (!["follow_up_clicked", "dish_added_from_ai", "ai_prompt_submitted"].includes(eventType)) {
    return fail(400, "Unsupported event_type");
  }
  const message = String(body.message ?? "").trim();
  logEvent({
    event_type: eventType === "ai_prompt_submitted" ? "ai_chat_request" : eventType,
    user,
    session_id: String(body.session_id ?? ""),
    message,
    model_name: "client_event",
    prompt_tokens: eventType === "ai_prompt_submitted" ? estimateTokens(message) : 0,
  });
  return ok({ ok: true }, 201);
};
