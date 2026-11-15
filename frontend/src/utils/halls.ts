/** Shared dining-hall helpers: photos, UIUC hours option ids, and status labels. */

export interface HallStatus {
  is_open: boolean;
  meal_label: string | null;
  closes_at: string | null;
}

export type HallStatusMap = Record<string, HallStatus>;

const THUMBNAIL_BASE = "/dininghall_thumbnails/";

const HALL_VISUALS = [
  { matcher: /field\s+of\s+greens/i, src: `${THUMBNAIL_BASE}greens.png`, short: "FoG" },
  { matcher: /ikenberry/i, src: `${THUMBNAIL_BASE}ikenberry_.png`, short: "Ike" },
  { matcher: /illinois\s+street|isr/i, src: `${THUMBNAIL_BASE}ISRhall.png`, short: "ISR" },
  { matcher: /kosher/i, src: `${THUMBNAIL_BASE}kosher.png`, short: "Kosher" },
  { matcher: /lincoln|allen/i, src: `${THUMBNAIL_BASE}allen.png`, short: "LAR" },
  { matcher: /pennsylvania|par/i, src: `${THUMBNAIL_BASE}PAR_.png`, short: "PAR" },
];

export function hallVisual(name: string, location = "") {
  const text = `${name} ${location}`;
  return HALL_VISUALS.find((v) => v.matcher.test(text)) ?? { src: "", short: name.slice(0, 3) };
}

/** UIUC Dining option ids used by the hours feed (they differ from database ids). */
export function hallOptionId(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes("ikenberry")) return "1";
  if (n.includes("pennsylvania") || n.includes("par")) return "2";
  if (n.includes("illinois street") || n.includes("isr")) return "3";
  if (n.includes("lincoln") || n.includes("allen")) return "5";
  if (n.includes("field of greens")) return "12";
  if (n.includes("kosher")) return "23";
  return null;
}

export function statusFor(name: string, map: HallStatusMap): HallStatus | undefined {
  const id = hallOptionId(name);
  return id ? map[id] : undefined;
}

export function statusLabel(status: HallStatus | undefined): string {
  if (!status) return "Hours unavailable";
  if (!status.is_open) return "Closed now";
  const meal = status.meal_label ? ` · ${status.meal_label}` : "";
  const until = status.closes_at ? ` until ${status.closes_at}` : "";
  return `Open${meal}${until}`;
}
