/**
 * POST /api/chat — the one server-side piece of SmartEats.
 *
 * Builds a menu-grounded prompt from today's static menu data and calls the
 * Gemini API (free tier). Everything else in the app runs in the browser.
 *
 * Env vars (Vercel project settings):
 *   GEMINI_API_KEY  required — use a key from a Google project WITHOUT billing
 *   GEMINI_MODEL    optional — defaults to gemini-flash-lite-latest
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildGoalMealPlan,
  buildMenuContext,
  buildPrompt,
  normalizeHistory,
  parseModelResponse,
  wantsGoalMealPlan,
  type MenuFile,
  type UserContext,
} from "../src/lib/chatCore.js";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";
const MAX_MESSAGE_CHARS = 600;
const MAX_CONTEXT_CHARS = 6000;
const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 25 };
const MENU_TTL_MS = 10 * 60 * 1000;

let menuCache: { menu: MenuFile; loadedAt: number } | null = null;
const hits = new Map<string, number[]>();

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

async function loadMenu(request: Request): Promise<MenuFile> {
  if (menuCache && Date.now() - menuCache.loadedAt < MENU_TTL_MS) return menuCache.menu;
  let menu: MenuFile;
  try {
    // Bundled with the function via vercel.json `includeFiles`.
    const file = path.join(process.cwd(), "public", "data", "menu.json");
    menu = JSON.parse(await readFile(file, "utf-8")) as MenuFile;
  } catch {
    // Fall back to the deployed static file (also used by the Vite dev middleware).
    const res = await fetch(new URL("/data/menu.json", request.url));
    menu = (await res.json()) as MenuFile;
  }
  menuCache = { menu, loadedAt: Date.now() };
  return menu;
}

async function callGemini(model: string, prompt: string, apiKey: string) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.35, responseMimeType: "application/json", maxOutputTokens: 900 },
    }),
  });
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
}

export async function POST(request: Request): Promise<Response> {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  if (rateLimited(ip)) return json(429, { error: "Too many requests. Try again in a few minutes." });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  const message = String(body.message ?? "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) return json(400, { error: "Message is required" });

  const history = normalizeHistory(body.history).map((h) => ({ ...h, content: h.content.slice(0, 1500) }));
  let userContext: UserContext | undefined;
  if (body.user_context && typeof body.user_context === "object") {
    const raw = JSON.stringify(body.user_context);
    if (raw.length <= MAX_CONTEXT_CHARS) userContext = body.user_context as UserContext;
  }

  const menu = await loadMenu(request);
  const ctx = buildMenuContext(menu, message, userContext);

  if (wantsGoalMealPlan(message, userContext)) {
    const plan = buildGoalMealPlan(message, userContext, ctx);
    if (plan) return json(200, plan);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return json(503, { error: "AI service not configured" });

  const prompt = buildPrompt(message, history, userContext, ctx);
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  let model = primary;
  let res = await callGemini(model, prompt, apiKey);
  if (res.status === 404 && primary !== FALLBACK_MODEL) {
    model = FALLBACK_MODEL;
    res = await callGemini(model, prompt, apiKey);
  }
  if (!res.ok) {
    const status = res.status === 429 ? 429 : 503;
    return json(status, { error: "AI service unavailable. Please try again later.", upstream_status: res.status });
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const usage = data.usageMetadata ?? {};
  const result = parseModelResponse(text, ctx, {
    model_name: model,
    prompt_tokens: usage.promptTokenCount ?? 0,
    completion_tokens: usage.candidatesTokenCount ?? 0,
    total_tokens: usage.totalTokenCount ?? 0,
    token_source: usage.totalTokenCount ? "provider" : "unknown",
  });
  if (!result) return json(503, { error: "AI service returned an unusable response." });
  return json(200, result);
}
