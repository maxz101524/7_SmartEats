/**
 * Serves the app's `${API_BASE}/...` axios calls from the browser instead of
 * a Django server: menu data comes from static JSON, user data from
 * localStorage, and AI chat from the /api/chat serverless function.
 *
 * Installed once in main.tsx. Pages keep calling axios exactly as they did
 * against the Django REST API.
 */
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { API_BASE } from "../config";
import { matchRoute } from "./routes";

function parseUrl(config: InternalAxiosRequestConfig): URL {
  const raw = config.baseURL && !/^https?:/.test(config.url ?? "") ? `${config.baseURL}${config.url}` : config.url ?? "";
  const url = new URL(raw, window.location.origin);
  const params = config.params as Record<string, unknown> | undefined;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function tokenFrom(config: InternalAxiosRequestConfig): string | null {
  const header = AxiosHeaders.from(config.headers).get("Authorization");
  const value = typeof header === "string" ? header : "";
  return value.startsWith("Token ") ? value.slice(6).trim() : null;
}

export function installLocalApi(): void {
  const networkAdapter = axios.getAdapter(axios.defaults.adapter);
  const apiPrefix = new URL(API_BASE, window.location.origin).pathname.replace(/\/$/, "");

  const localAdapter: AxiosAdapter = async (config) => {
    const url = parseUrl(config);
    const isApi = url.origin === window.location.origin && url.pathname.startsWith(`${apiPrefix}/`);
    const route = isApi ? matchRoute((config.method ?? "get").toUpperCase(), url.pathname.slice(apiPrefix.length)) : null;
    if (!route) return networkAdapter(config);

    if (config.signal?.aborted) throw new axios.CanceledError(undefined, undefined, config);

    let body: unknown = config.data;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // leave as string
      }
    }

    const result = await route.handler(
      {
        method: (config.method ?? "get").toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        body,
        token: tokenFrom(config),
        signal: config.signal as AbortSignal | undefined,
      },
      route.params,
    );

    let data = result.data;
    if (config.responseType === "blob" && typeof data === "string") {
      data = new Blob([data], { type: result.headers?.["content-type"] ?? "text/plain" });
    }
    const response: AxiosResponse = {
      data,
      status: result.status,
      statusText: String(result.status),
      headers: new AxiosHeaders(result.headers ?? { "content-type": "application/json" }),
      config,
      request: { localApi: true },
    };
    const validate = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
    if (!validate(result.status)) {
      throw new AxiosError(
        `Request failed with status code ${result.status}`,
        result.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
        config,
        response.request,
        response,
      );
    }
    return response;
  };

  axios.defaults.adapter = localAdapter;
}
