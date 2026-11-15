/**
 * AI analytics dashboard endpoints (port of mealPlanning/api_views.py),
 * computed over the archived production events plus this browser's events.
 */
import { readDb } from "../db";
import { getAnalyticsSnapshot, type AnalyticsEventRecord } from "../staticData";
import { isResponse, ok, requireUser, type Handler, type LocalRequest, type LocalResponse } from "../http";

const BUCKET_ORDER = ["0-50", "51-150", "151-300", "301+"];

async function allEvents(): Promise<AnalyticsEventRecord[]> {
  let archived: AnalyticsEventRecord[] = [];
  try {
    archived = (await getAnalyticsSnapshot()).events;
  } catch {
    archived = [];
  }
  const local = readDb().events.map((e) => ({ ...e, user: e.user === null ? null : `local-${e.user}` }));
  return [...archived, ...local];
}

async function chatEvents() {
  return (await allEvents()).filter((e) => e.event_type === "ai_chat_request");
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.round((sorted.length - 1) * p)];
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Events in the last `days`; if that window is empty (archived data), anchor it at the newest event. */
function inWindow(events: AnalyticsEventRecord[], days: number): AnalyticsEventRecord[] {
  const span = days * 24 * 3600 * 1000;
  const recent = events.filter((e) => Date.now() - Date.parse(e.timestamp) <= span);
  if (recent.length || !events.length) return recent;
  const newest = Math.max(...events.map((e) => Date.parse(e.timestamp)));
  return events.filter((e) => newest - Date.parse(e.timestamp) <= span);
}

function windowDays(req: LocalRequest): number {
  return Math.max(1, Math.min(Number(req.query.get("days") ?? 14) || 14, 60));
}

function authed(handler: Handler): Handler {
  return (req, params) => {
    const user = requireUser(req);
    if (isResponse(user)) return user as LocalResponse;
    return handler(req, params);
  };
}

const day = (timestamp: string) => timestamp.slice(0, 10);

export const latencyByBucket = authed(async () => {
  const groups = new Map<string, number[]>();
  for (const e of await chatEvents()) {
    const key = e.input_bucket || "unknown";
    groups.set(key, [...(groups.get(key) ?? []), e.latency_ms]);
  }
  return ok(
    BUCKET_ORDER.filter((b) => groups.get(b)?.length).map((bucket) => {
      const values = groups.get(bucket)!;
      return { bucket, avg_latency_ms: round(values.reduce((s, v) => s + v, 0) / values.length, 2), count: values.length };
    }),
  );
});

export const latencyDistribution = authed(async () => {
  const latencies = (await chatEvents()).map((e) => e.latency_ms).filter((v) => v !== 0);
  if (!latencies.length) return ok([]);
  const size = Math.max(100, Math.floor(Math.max(...latencies) / 8) || 1);
  const bins = new Map<number, number>();
  for (const v of latencies) {
    const start = Math.floor(v / size) * size;
    bins.set(start, (bins.get(start) ?? 0) + 1);
  }
  return ok(
    [...bins.entries()].sort(([a], [b]) => a - b).map(([start, count]) => ({ latency_range: `${start}-${start + size}`, count })),
  );
});

export const latencyTrend = authed(async (req) => {
  const events = inWindow(await chatEvents(), windowDays(req));
  const byDay = new Map<string, number[]>();
  for (const e of events) byDay.set(day(e.timestamp), [...(byDay.get(day(e.timestamp)) ?? []), e.latency_ms]);
  const latencies = events.map((e) => e.latency_ms).filter((v) => v !== 0).sort((a, b) => a - b);
  return ok({
    series: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({ date, avg_latency_ms: round(values.reduce((s, v) => s + v, 0) / values.length, 2), count: values.length })),
    summary: {
      p50_latency_ms: percentile(latencies, 0.5),
      p95_latency_ms: percentile(latencies, 0.95),
      request_count: latencies.length,
    },
  });
});

export const behaviorDau = authed(async (req) => {
  const events = inWindow(await chatEvents(), windowDays(req)).filter((e) => e.user !== null);
  const users = new Map<string, Set<string>>();
  for (const e of events) {
    const set = users.get(day(e.timestamp)) ?? new Set<string>();
    set.add(String(e.user));
    users.set(day(e.timestamp), set);
  }
  return ok([...users.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, set]) => ({ date, dau: set.size })));
});

export const behaviorIntents = authed(async () => {
  const counts = new Map<string, number>();
  for (const e of await chatEvents()) counts.set(e.intent_label || "general", (counts.get(e.intent_label || "general") ?? 0) + 1);
  return ok(
    [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([intent, count]) => ({ intent, count })),
  );
});

export const behaviorConversion = authed(async () => {
  const events = await allEvents();
  const chats = events.filter((e) => e.event_type === "ai_chat_request");
  const querySessions = new Set(chats.map((e) => e.session_id).filter(Boolean));
  const converted = new Set(events.filter((e) => e.event_type === "dish_added_from_ai").map((e) => e.session_id).filter(Boolean));
  const numerator = [...querySessions].filter((s) => converted.has(s)).length;
  const followUps = events.filter((e) => e.event_type === "follow_up_clicked").length;
  return ok({
    query_users: querySessions.size,
    converted_users: numerator,
    conversion_rate: querySessions.size ? round(numerator / querySessions.size, 4) : 0,
    follow_up_rate: chats.length ? round(followUps / chats.length, 4) : 0,
  });
});

export const costSummary = authed(async () => {
  const events = await chatEvents();
  const totalTokens = events.reduce((s, e) => s + e.total_tokens, 0);
  const totalCost = events.reduce((s, e) => s + e.estimated_cost_usd, 0);
  const sessions = new Map<string, number>();
  for (const e of events) if (e.session_id) sessions.set(e.session_id, (sessions.get(e.session_id) ?? 0) + e.estimated_cost_usd);
  const sessionTotal = [...sessions.values()].reduce((s, v) => s + v, 0);
  return ok({
    request_count: events.length,
    session_count: sessions.size,
    total_tokens: totalTokens,
    avg_tokens_per_request: events.length ? round(totalTokens / events.length, 2) : 0,
    total_estimated_cost_usd: round(totalCost, 6),
    avg_cost_per_request_usd: events.length ? round(totalCost / events.length, 6) : 0,
    avg_cost_per_session_usd: sessions.size ? round(sessionTotal / sessions.size, 6) : 0,
  });
});

export const costTopQueries = authed(async () => {
  const events = [...(await chatEvents())].sort(
    (a, b) => b.total_tokens - a.total_tokens || b.timestamp.localeCompare(a.timestamp),
  );
  return ok(
    events.slice(0, 5).map((e) => ({
      timestamp: e.timestamp,
      prompt_preview: e.prompt_text_redacted,
      prompt_chars: e.prompt_chars,
      total_tokens: e.total_tokens,
      estimated_cost_usd: e.estimated_cost_usd,
      intent: e.intent_label || "general",
    })),
  );
});

export const costInputVsTokens = authed(async () => {
  const events = [...(await chatEvents())].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 200);
  return ok(events.map((e) => ({ prompt_chars: e.prompt_chars, total_tokens: e.total_tokens, intent: e.intent_label || "general" })));
});
