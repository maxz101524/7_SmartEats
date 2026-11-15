/**
 * Data source for the app's `${API_BASE}/...` calls.
 *
 * - "static" (default, production): no backend server. Requests are served in
 *   the browser by src/localApi from the daily-refreshed JSON in public/data,
 *   localStorage, and the /api/chat serverless function.
 * - "django": talk to the original Django REST backend (set
 *   VITE_DATA_MODE=django, optionally VITE_BACKEND_BASE_URL).
 */
export const DATA_MODE: "static" | "django" =
  import.meta.env.VITE_DATA_MODE === "django" ? "django" : "static";

export const BACKEND_BASE =
  DATA_MODE === "django"
    ? import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:8000"
    : "";

export const API_BASE = `${BACKEND_BASE}/api`;
