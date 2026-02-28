const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

const PRODUCTION_BACKEND = "https://seven-smarteats-fuiw.onrender.com/";

export const BACKEND_BASE =
  import.meta.env.VITE_BACKEND_BASE_URL ||
  (isLocal ? "http://localhost:8000" : PRODUCTION_BACKEND);

export const API_BASE = `${BACKEND_BASE}/api`;
