// HTTP client for billerpe-local-exe (the outlet's on-premise server).
// This app never talks to the cloud (uat-backend-v2) directly - everything,
// including reservations, goes through the exe (which relays what it must).
//
// The exe's responce/res.js shapes every business response as
// { error, results, code } and mostly answers HTTP 200 even on failure, so
// `error`/`results` is the signal, not res.ok. middleware/adminAuth.js is the
// one path that real-401s, and it accepts `Authorization: Bearer <token>` -
// the token restaurantLogin/pinLogin hand back in their body. A WebView
// cannot rely on the exe's cross-site httpOnly cookie, so bearer is the only
// auth path this app uses.

import { getBaseUrl } from "./discovery";

export type ApiEnvelope<T> = { error: boolean; results: T; code?: number };

export class ApiError extends Error {
  needsRegistration?: boolean;
  status?: number;
  constructor(message: string, opts?: { needsRegistration?: boolean; status?: number }) {
    super(message);
    this.name = "ApiError";
    if (opts?.needsRegistration !== undefined) this.needsRegistration = opts.needsRegistration;
    if (opts?.status !== undefined) this.status = opts.status;
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Session expired - please sign in again") {
    super(message, { status: 401 });
    this.name = "UnauthorizedError";
  }
}

export class NetworkError extends ApiError {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

const TOKEN_KEY = "billerpe.captain.token";

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable - session simply won't survive a restart
  }
}

let onUnauthorized: (() => void) | null = null;
/** The store registers its logout here so an expired session drops straight to /login. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

const GENERIC_BACKEND_MESSAGES = new Set(["Internal Server Error", "Request failed"]);
const FRIENDLY_GENERIC_MESSAGE = "Something went wrong. Please try again in a moment.";

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function unwrap<T>(json: ApiEnvelope<T> | null, status: number): T {
  if (!json || json.error) {
    const results =
      json?.results && typeof json.results === "object"
        ? (json.results as { message?: unknown; needsRegistration?: unknown })
        : undefined;
    const message = results && "message" in results ? String(results.message) : "Request failed";
    throw new ApiError(GENERIC_BACKEND_MESSAGES.has(message) ? FRIENDLY_GENERIC_MESSAGE : message, {
      needsRegistration: results?.needsRegistration === true,
      status,
    });
  }
  return json.results;
}

type RequestOpts = { raw?: boolean; timeoutMs?: number; skipAuthRedirect?: boolean };

async function request<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  opts?: RequestOpts,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new NetworkError(
      err instanceof DOMException && err.name === "AbortError"
        ? "The local server took too long to respond"
        : "Could not reach the BillerPe local server",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    if (!opts?.skipAuthRedirect) {
      setStoredToken(null);
      onUnauthorized?.();
    }
    const json = (await res.json().catch(() => null)) as ApiEnvelope<{ message?: string }> | null;
    const msg = json?.results?.message;
    throw new UnauthorizedError(typeof msg === "string" && msg ? msg : undefined);
  }

  const json = (await res.json().catch(() => null)) as unknown;
  if (opts?.raw) {
    if (!res.ok || json === null) throw new ApiError("Request failed", { status: res.status });
    return json as T;
  }
  return unwrap(json as ApiEnvelope<T> | null, res.status);
}

export const http = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body: unknown, opts?: RequestOpts) =>
    request<T>("POST", path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOpts) => request<T>("PUT", path, body, opts),
  delete: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>("DELETE", path, body, opts),
};

export function describeError(err: unknown, fallback = "Something went wrong"): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
