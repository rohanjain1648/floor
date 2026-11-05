import { fail } from "@agent-native/core/action";
import { emit } from "@agent-native/core/event-bus";
import { recordChange } from "@agent-native/core/server/poll";
import { accessFilter } from "@agent-native/core/sharing";
import { and, asc, eq, gt, sql } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 280;
export const QUESTIONS_PER_PERSON = 25;
export const SUBMIT_COOLDOWN_MS = 5_000;
export const QUESTION_SUBMITTED_EVENT = "floor.question.submitted";

export type SessionRow = typeof schema.floorSessions.$inferSelect;
export type QuestionRow = typeof schema.floorQuestions.$inferSelect;
export type Actor = "agent" | "host";

const AGENT_CALLERS = new Set(["tool", "automation", "mcp", "webmcp", "a2a"]);

/** The agent loop, automations and external agents (MCP, WebMCP in the
 * browser, A2A) all count as the agent; people use the UI or CLI. */
export function actorFor(caller: string | undefined): Actor {
  return caller && AGENT_CALLERS.has(caller) ? "agent" : "host";
}

export async function requireSession(
  id: string,
  minRole: "viewer" | "editor" = "viewer",
): Promise<SessionRow> {
  const { floorSessions, floorSessionShares } = schema;
  const [row] = await getDb()
    .select()
    .from(floorSessions)
    .where(
      and(
        eq(floorSessions.id, id),
        accessFilter(floorSessions, floorSessionShares, undefined, minRole),
      ),
    )
    .limit(1);
  if (!row) fail("Session not found.", { errorCode: "not_found", statusCode: 404 });
  return row;
}

/** Public lookup by join code; no user context, so no access filter. */
export async function sessionByCode(code: string): Promise<SessionRow | null> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(normalized)) return null;
  const [row] = await getDb()
    .select()
    .from(schema.floorSessions)
    .where(eq(schema.floorSessions.code, normalized))
    .limit(1);
  return row ?? null;
}

export async function sessionQuestions(sessionId: string) {
  return getDb()
    .select()
    .from(schema.floorQuestions)
    .where(eq(schema.floorQuestions.sessionId, sessionId))
    .orderBy(asc(schema.floorQuestions.createdAt))
    .limit(1000);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newJoinCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(
    "",
  );
}

/** Tells every open board for this session that its questions changed. */
export function notifySession(
  session: Pick<SessionRow, "id" | "ownerEmail" | "orgId">,
): void {
  recordChange({
    source: "action",
    type: "change",
    key: "floor-session",
    owner: session.ownerEmail,
    ...(session.orgId ? { orgId: session.orgId } : {}),
    resourceType: "floor-session",
    resourceId: session.id,
  });
}

export function sessionChangeResource(sessionId: string | undefined | null) {
  return sessionId
    ? { resourceType: "floor-session", resourceId: sessionId }
    : null;
}

// ---------------------------------------------------------------------------
// Near-duplicate hints. A cheap lexical pass that works with no model at all;
// the agent does the semantic clustering on top of it.

const STOPWORDS = new Set(
  "the and for are you your with this that what when will how can does did was were have has had any there their they them from into about which would could should just like also more some than then its it's our out who why where been being get got use using is a an of to in on at be or as by we i me my do so if not no yes".split(
    " ",
  ),
);

function stem(raw: string): string {
  let word = raw;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
    word = word.slice(0, -1);
  }
  if (word.length > 5 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("e")) return word.slice(0, -1);
  return word;
}

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem),
  );
}

export function similarity(a: string, b: string): number {
  const ta = terms(a);
  const tb = terms(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared / (ta.size + tb.size - shared);
}

export const DUPLICATE_HINT_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Read models

export interface BoardQuestion {
  id: string;
  body: string;
  authorName: string | null;
  votes: number;
  totalVotes: number;
  status: QuestionRow["status"];
  theme: string | null;
  rank: number | null;
  note: string | null;
  answer: string | null;
  answerState: QuestionRow["answerState"];
  answerBy: QuestionRow["answerBy"];
  triagedBy: QuestionRow["triagedBy"];
  triagedAt: string | null;
  createdAt: string;
  answeredAt: string | null;
  duplicates: { id: string; body: string; authorName: string | null; votes: number }[];
  /** Lexical near-duplicate of an earlier visible question, if any. */
  looksLike: { id: string; body: string; score: number } | null;
}

export function boardQuestions(rows: QuestionRow[]): BoardQuestion[] {
  const children = new Map<string, QuestionRow[]>();
  for (const row of rows) {
    if (!row.duplicateOf) continue;
    const list = children.get(row.duplicateOf) ?? [];
    list.push(row);
    children.set(row.duplicateOf, list);
  }
  const canonical = rows.filter((row) => !row.duplicateOf);
  const earlierVisible: QuestionRow[] = [];
  return canonical.map((row) => {
    const dupes = children.get(row.id) ?? [];
    let looksLike: BoardQuestion["looksLike"] = null;
    if (row.status === "new" && !row.triagedBy) {
      for (const other of earlierVisible) {
        const score = similarity(row.body, other.body);
        if (
          score >= DUPLICATE_HINT_THRESHOLD &&
          (!looksLike || score > looksLike.score)
        ) {
          looksLike = { id: other.id, body: other.body, score };
        }
      }
    }
    if (row.status !== "hidden") earlierVisible.push(row);
    return {
      id: row.id,
      body: row.body,
      authorName: row.authorName,
      votes: row.votes,
      totalVotes: row.votes + dupes.reduce((sum, d) => sum + d.votes, 0),
      status: row.status,
      theme: row.theme,
      rank: row.rank,
      note: row.note,
      answer: row.answer,
      answerState: row.answerState,
      answerBy: row.answerBy,
      triagedBy: row.triagedBy,
      triagedAt: row.triagedAt,
      createdAt: row.createdAt,
      answeredAt: row.answeredAt,
      duplicates: dupes.map((d) => ({
        id: d.id,
        body: d.body,
        authorName: d.authorName,
        votes: d.votes,
      })),
      looksLike,
    };
  });
}

export interface Pulse {
  summary: string;
  themes: { name: string; count: number }[];
  updatedAt: string;
}

export function parsePulse(raw: string | null): Pulse | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Pulse;
    return value && typeof value.summary === "string" ? value : null;
  } catch {
    return null;
  }
}

/** What an anonymous audience member may see. Never exposes hidden questions
 * from other people, author tokens, drafts, or moderator notes. */
export function publicSnapshot(
  session: SessionRow,
  rows: QuestionRow[],
  voterToken: string | null,
  myVotes: Set<string>,
) {
  const board = boardQuestions(rows);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visible = board
    .filter((q) => q.status !== "hidden")
    .map((q) => ({
      id: q.id,
      body: q.body,
      authorName: q.authorName,
      votes: q.totalVotes,
      status: q.status,
      theme: q.theme,
      mergedCount: q.duplicates.length,
      answer: q.answerState === "published" ? q.answer : null,
      answerBy: q.answerState === "published" ? q.answerBy : null,
      onStage: session.stageQuestionId === q.id,
      createdAt: q.createdAt,
      voted:
        myVotes.has(q.id) || q.duplicates.some((d) => myVotes.has(d.id)),
    }));
  const mine = voterToken
    ? rows
        .filter((row) => row.authorToken === voterToken)
        .map((row) => {
          const parent = row.duplicateOf ? byId.get(row.duplicateOf) : null;
          return {
            id: row.id,
            body: row.body,
            status: row.status,
            mergedInto: parent ? { id: parent.id, body: parent.body } : null,
            answer: row.answerState === "published" ? row.answer : null,
            createdAt: row.createdAt,
          };
        })
    : [];
  const pulse = parsePulse(session.pulse);
  return {
    session: {
      code: session.code,
      title: session.title,
      status: session.status,
      stageQuestionId: session.stageQuestionId,
      pulse: pulse ? { summary: pulse.summary, themes: pulse.themes } : null,
    },
    questions: visible,
    mine,
  };
}

// ---------------------------------------------------------------------------
// Writes shared by the public routes and the actions

export function cleanQuestionBody(raw: string): string {
  const body = raw.replace(/\s+/g, " ").trim();
  if (body.length < QUESTION_MIN) {
    fail("Questions need at least a few words.", {
      errorCode: "too_short",
      statusCode: 400,
    });
  }
  if (body.length > QUESTION_MAX) {
    fail(`Keep questions under ${QUESTION_MAX} characters.`, {
      errorCode: "too_long",
      statusCode: 400,
    });
  }
  return body;
}

async function assertWithinLimits(sessionId: string, authorToken: string) {
  const q = schema.floorQuestions;
  const db = getDb();
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(q)
    .where(
      and(
        eq(q.sessionId, sessionId),
        eq(q.authorToken, authorToken),
        gt(q.createdAt, new Date(Date.now() - SUBMIT_COOLDOWN_MS).toISOString()),
      ),
    );
  if ((recent?.count ?? 0) > 0) {
    fail("One moment — you just asked something.", {
      errorCode: "slow_down",
      statusCode: 429,
    });
  }
  const [total] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(q)
    .where(and(eq(q.sessionId, sessionId), eq(q.authorToken, authorToken)));
  if ((total?.count ?? 0) >= QUESTIONS_PER_PERSON) {
    fail("You've reached the question limit for this session.", {
      errorCode: "limit_reached",
      statusCode: 429,
    });
  }
}

export async function insertQuestion(
  session: SessionRow,
  input: { body: string; authorName?: string | null; authorToken: string },
  options: { enforceLimits?: boolean } = {},
): Promise<QuestionRow> {
  if (session.status === "ended") {
    fail("This session has ended.", {
      errorCode: "session_closed",
      statusCode: 409,
    });
  }
  if (session.status !== "live" && options.enforceLimits !== false) {
    fail("Questions are paused for a moment.", {
      errorCode: "session_paused",
      statusCode: 409,
    });
  }
  const body = cleanQuestionBody(input.body);
  const authorName = input.authorName?.replace(/\s+/g, " ").trim().slice(0, 40) || null;
  const q = schema.floorQuestions;
  const db = getDb();

  if (options.enforceLimits !== false) {
    await assertWithinLimits(session.id, input.authorToken);
  }

  const row: QuestionRow = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    body,
    authorName,
    authorToken: input.authorToken,
    votes: 0,
    status: "new",
    duplicateOf: null,
    theme: null,
    rank: null,
    note: null,
    answer: null,
    answerState: "none",
    answerBy: null,
    triagedBy: null,
    triagedAt: null,
    answeredAt: null,
    createdAt: new Date().toISOString(),
    ownerEmail: session.ownerEmail,
    orgId: session.orgId,
  };
  await db.insert(q).values(row);
  notifySession(session);
  try {
    emit(
      QUESTION_SUBMITTED_EVENT,
      {
        sessionId: session.id,
        sessionTitle: session.title,
        questionId: row.id,
        body: row.body,
        authorName: row.authorName,
      },
      { owner: session.ownerEmail },
    );
  } catch (error) {
    console.warn("[floor] could not emit question event", error);
  }
  return row;
}

/** Toggles one person's vote. The (question, voter) primary key keeps it to
 * one vote each even under concurrent taps. */
export async function toggleVote(
  session: SessionRow,
  questionId: string,
  voterToken: string,
): Promise<{ voted: boolean; votes: number }> {
  const q = schema.floorQuestions;
  const v = schema.floorVotes;
  const result = await getDb().transaction(async (tx) => {
    const [question] = await tx
      .select({ id: q.id, status: q.status })
      .from(q)
      .where(and(eq(q.id, questionId), eq(q.sessionId, session.id)))
      .for("update");
    if (!question || question.status === "hidden") {
      fail("Question not found.", { errorCode: "not_found", statusCode: 404 });
    }
    const inserted = await tx
      .insert(v)
      .values({
        questionId,
        voterToken,
        ownerEmail: session.ownerEmail,
        orgId: session.orgId,
      })
      .onConflictDoNothing()
      .returning({ questionId: v.questionId });
    if (inserted.length === 0) {
      await tx
        .delete(v)
        .where(and(eq(v.questionId, questionId), eq(v.voterToken, voterToken)));
    }
    const [updated] = await tx
      .update(q)
      .set({
        votes: inserted.length
          ? sql`${q.votes} + 1`
          : sql`greatest(${q.votes} - 1, 0)`,
      })
      .where(eq(q.id, questionId))
      .returning({ votes: q.votes });
    return { voted: inserted.length > 0, votes: updated?.votes ?? 0 };
  });
  notifySession(session);
  return result;
}
