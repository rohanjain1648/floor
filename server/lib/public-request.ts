import { getRouterParam, setResponseHeader, setResponseStatus, type H3Event } from "h3";

import { sessionByCode, type SessionRow } from "./floor.js";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Anonymous audience members identify themselves with a random browser token. */
export function voterToken(value: unknown): string | null {
  return typeof value === "string" && TOKEN_PATTERN.test(value) ? value : null;
}

export async function sessionFromRoute(
  event: H3Event,
): Promise<SessionRow | null> {
  setResponseHeader(event, "Cache-Control", "no-store");
  const code = getRouterParam(event, "code") ?? "";
  return sessionByCode(decodeURIComponent(code));
}

export function publicError(event: H3Event, status: number, error: string, message: string) {
  setResponseStatus(event, status);
  return { error, message };
}

/** Converts a `fail()` thrown by shared domain code into a JSON reply. */
export function failureReply(event: H3Event, error: unknown) {
  const e = error as { statusCode?: number; errorCode?: string; message?: string };
  if (e && typeof e.statusCode === "number" && e.statusCode < 500) {
    return publicError(event, e.statusCode, e.errorCode ?? "invalid", e.message ?? "Request failed.");
  }
  console.error("[floor] public request failed", error);
  return publicError(event, 500, "server_error", "Something went wrong. Try again.");
}
