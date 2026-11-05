import { sql } from "drizzle-orm";
import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import {
  createSharesTable,
  ownableColumns,
} from "@agent-native/core/db/schema";

// A live Q&A room. Org-visible when an org is active so co-moderators share
// the board; private to its creator otherwise.
export const floorSessions = pgTable("floor_sessions", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  briefing: text("briefing").notNull().default(""),
  status: text("status", { enum: ["live", "paused", "ended"] })
    .notNull()
    .default("live"),
  stageQuestionId: text("stage_question_id"),
  autopilot: integer("autopilot").notNull().default(0),
  // JSON: { summary, themes: [{ name, count }], updatedAt }
  pulse: text("pulse"),
  recap: text("recap"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
  ...ownableColumns(),
});
export const floorSessionShares = createSharesTable("floor_session_shares");

// Audience questions inherit their session's access. owner_email/org_id are
// copied from the session so agent SQL tools stay tenant-scoped.
export const floorQuestions = pgTable("floor_questions", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  body: text("body").notNull(),
  authorName: text("author_name"),
  authorToken: text("author_token").notNull(),
  votes: integer("votes").notNull().default(0),
  status: text("status", { enum: ["new", "queued", "answered", "hidden"] })
    .notNull()
    .default("new"),
  duplicateOf: text("duplicate_of"),
  theme: text("theme"),
  rank: integer("rank"),
  note: text("note"),
  answer: text("answer"),
  answerState: text("answer_state", { enum: ["none", "draft", "published"] })
    .notNull()
    .default("none"),
  answerBy: text("answer_by", { enum: ["agent", "host"] }),
  triagedBy: text("triaged_by", { enum: ["agent", "host"] }),
  triagedAt: text("triaged_at"),
  answeredAt: text("answered_at"),
  createdAt: text("created_at").notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
});

export const floorVotes = pgTable(
  "floor_votes",
  {
    questionId: text("question_id").notNull(),
    voterToken: text("voter_token").notNull(),
    ownerEmail: text("owner_email").notNull(),
    orgId: text("org_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.voterToken] })],
);
