const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (isLocal ? "http://localhost:8000" : "https://seven-smarteats.onrender.com");

export const API_BASE = `${BACKEND_BASE}/api`;
