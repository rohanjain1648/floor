import { appPath } from "@agent-native/core/client/api-path";

export type QuestionStatus = "new" | "queued" | "answered" | "hidden";
export type SessionStatus = "live" | "paused" | "ended";

export interface BoardQuestion {
  id: string;
  body: string;
  authorName: string | null;
  votes: number;
  totalVotes: number;
  status: QuestionStatus;
  theme: string | null;
  rank: number | null;
  note: string | null;
  answer: string | null;
  answerState: "none" | "draft" | "published";
  answerBy: "agent" | "host" | null;
  triagedBy: "agent" | "host" | null;
  triagedAt: string | null;
  createdAt: string;
  answeredAt: string | null;
  duplicates: {
    id: string;
    body: string;
    authorName: string | null;
    votes: number;
  }[];
  looksLike: { id: string; body: string; score: number } | null;
}

export interface Pulse {
  summary: string;
  themes: { name: string; count: number }[];
  updatedAt?: string;
}

/** Where phones should open the session. Local dev sign-in only works on
 * localhost, so a LAN or tunnel origin can be set for the join link and QR. */
export function joinUrl(code: string): string {
  const configured = (
    import.meta.env.VITE_FLOOR_JOIN_ORIGIN as string | undefined
  )?.replace(/\/$/, "");
  const origin =
    configured ||
    (typeof window === "undefined" ? "" : window.location.origin);
  return `${origin}${appPath(`/j/${code}`)}`;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Up next order: the agent's or moderator's rank, then audience votes. */
export function upNextOrder(a: BoardQuestion, b: BoardQuestion): number {
  return (
    (a.rank ?? 999) - (b.rank ?? 999) ||
    b.totalVotes - a.totalVotes ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

export function errorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "errorCode" in error &&
    typeof error.errorCode === "string"
  )
    return error.errorCode;
  return undefined;
}

/** True for a few seconds after the agent touched a question, to flash it. */
export function agentFresh(q: Pick<BoardQuestion, "triagedBy" | "triagedAt">) {
  return (
    q.triagedBy === "agent" &&
    !!q.triagedAt &&
    Date.now() - Date.parse(q.triagedAt) < 4000
  );
}
