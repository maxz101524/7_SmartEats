import { userForToken, type LocalUser } from "./db";

export interface LocalRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  token: string | null;
  signal?: AbortSignal;
}

export interface LocalResponse {
  status: number;
  data: unknown;
  headers?: Record<string, string>;
}

export type Handler = (req: LocalRequest, params: string[]) => Promise<LocalResponse> | LocalResponse;

export const ok = (data: unknown, status = 200): LocalResponse => ({ status, data });
export const fail = (status: number, error: string): LocalResponse => ({ status, data: { error } });

/** Mirrors DRF's IsAuthenticated: 401 with a `detail` message when the token is missing/invalid. */
export function requireUser(req: LocalRequest): LocalUser | LocalResponse {
  const user = userForToken(req.token);
  if (!user) return { status: 401, data: { detail: "Authentication credentials were not provided." } };
  return user;
}

export function isResponse(value: unknown): value is LocalResponse {
  return Boolean(value && typeof value === "object" && "status" in value && "data" in value);
}

export function bodyObject(req: LocalRequest): Record<string, unknown> {
  if (req.body && typeof req.body === "object") return req.body as Record<string, unknown>;
  if (typeof req.body === "string" && req.body) {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}
