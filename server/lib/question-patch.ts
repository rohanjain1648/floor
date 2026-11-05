import { fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../db/index.js";
import {
  notifySession,
  type Actor,
  type QuestionRow,
  type SessionRow,
} from "./floor.js";

export const questionPatchFields = {
  status: z
    .enum(["new", "queued", "answered", "hidden"])
    .optional()
    .describe(
      "new = untouched inbox, queued = Up next, answered = handled live or by a published answer, hidden = screened out (always give a note)",
    ),
  theme: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .nullable()
    .optional()
    .describe("Short topic label shared by related questions, e.g. 'Pricing'"),
  duplicateOf: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Id of the question this one repeats; its votes roll up there. null splits it back out.",
    ),
  rank: z.coerce
    .number()
    .int()
    .min(1)
    .max(999)
    .nullable()
    .optional()
    .describe("Position in Up next, 1 = ask next"),
  note: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .optional()
    .describe("One-line reason the moderator sees, e.g. 'Off-topic: job ad'"),
  answer: z
    .string()
    .trim()
    .max(1500)
    .nullable()
    .optional()
    .describe(
      "Reply text. From the agent it is always saved as a draft for a person to approve.",
    ),
  answerState: z
    .enum(["none", "draft", "published"])
    .optional()
    .describe(
      "published shows the answer to the audience; only a person can publish",
    ),
};

export const questionPatchSchema = z.object(questionPatchFields);
export type QuestionPatch = z.infer<typeof questionPatchSchema> & { id: string };

/**
 * Applies moderator or agent edits to questions in one session, in one
 * transaction. Rules enforced here for every caller:
 * - a duplicate always points at a canonical (non-duplicate) question
 * - only a person can publish an answer; agent answers stay drafts
 */
export async function applyQuestionPatches(
  session: SessionRow,
  patches: QuestionPatch[],
  actor: Actor,
): Promise<QuestionRow[]> {
  const q = schema.floorQuestions;
  const now = new Date().toISOString();
  const changed = await getDb().transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(q)
      .where(eq(q.sessionId, session.id))
      .for("update");
    const byId = new Map(rows.map((row) => [row.id, { ...row }]));
    const missing = patches.filter((p) => !byId.has(p.id)).map((p) => p.id);
    if (missing.length) {
      fail(`Unknown question id(s) in this session: ${missing.join(", ")}`, {
        errorCode: "not_found",
        statusCode: 404,
      });
    }
    const dirty = new Set<string>();

    const canonicalOf = (id: string): QuestionRow | undefined => {
      let current = byId.get(id);
      for (let hops = 0; current?.duplicateOf && hops < 10; hops += 1) {
        current = byId.get(current.duplicateOf);
      }
      return current;
    };

    for (const patch of patches) {
      const row = byId.get(patch.id)!;

      if (patch.duplicateOf !== undefined) {
        if (patch.duplicateOf === null) {
          row.duplicateOf = null;
        } else {
          const target = canonicalOf(patch.duplicateOf);
          if (!target) {
            fail(`Merge target ${patch.duplicateOf} is not in this session.`, {
              errorCode: "not_found",
              statusCode: 404,
            });
          }
          if (target.id === row.id) {
            fail("A question can't be merged into itself.", {
              errorCode: "invalid_merge",
              statusCode: 400,
            });
          }
          row.duplicateOf = target.id;
          for (const child of byId.values()) {
            if (child.duplicateOf === row.id) {
              child.duplicateOf = target.id;
              dirty.add(child.id);
            }
          }
        }
      }

      if (patch.status !== undefined) {
        row.status = patch.status;
        if (patch.status === "answered" && !row.answeredAt) row.answeredAt = now;
        if (actor === "host" && patch.note === undefined) row.note = null;
      }
      if (patch.theme !== undefined) row.theme = patch.theme;
      if (patch.rank !== undefined) row.rank = patch.rank;
      if (patch.note !== undefined) row.note = patch.note || null;

      if (patch.answer !== undefined) {
        if (!patch.answer) {
          row.answer = null;
          row.answerState = "none";
          row.answerBy = null;
        } else {
          if (actor === "agent") {
            row.answerBy = "agent";
            row.answerState = "draft";
          } else {
            if (patch.answer !== row.answer || !row.answerBy) row.answerBy = "host";
            if (row.answerState === "none") row.answerState = "draft";
          }
          row.answer = patch.answer;
        }
      }

      if (patch.answerState !== undefined) {
        if (patch.answerState === "published") {
          if (actor === "agent") {
            fail(
              "Only a moderator can publish an answer. Save it as a draft and tell the user it is waiting for their approval.",
              { errorCode: "needs_host_approval", statusCode: 403 },
            );
          }
          if (!row.answer) {
            fail("Write an answer before publishing it.", {
              errorCode: "empty_answer",
              statusCode: 400,
            });
          }
          row.answerState = "published";
          row.answeredAt = row.answeredAt ?? now;
          if (patch.status === undefined) row.status = "answered";
        } else if (patch.answerState === "none") {
          row.answer = null;
          row.answerState = "none";
          row.answerBy = null;
        } else {
          row.answerState = row.answer ? "draft" : "none";
        }
      }

      row.triagedBy = actor;
      row.triagedAt = now;
      dirty.add(row.id);
    }

    const updated: QuestionRow[] = [];
    for (const id of dirty) {
      const row = byId.get(id)!;
      await tx
        .update(q)
        .set({
          status: row.status,
          theme: row.theme,
          rank: row.rank,
          note: row.note,
          duplicateOf: row.duplicateOf,
          answer: row.answer,
          answerState: row.answerState,
          answerBy: row.answerBy,
          triagedBy: row.triagedBy,
          triagedAt: row.triagedAt,
          answeredAt: row.answeredAt,
        })
        .where(eq(q.id, id));
      updated.push(row);
    }
    return updated;
  });
  notifySession(session);
  return changed;
}

/** Compact shape actions return so the agent can confirm what it changed. */
export function questionSummary(row: QuestionRow) {
  return {
    id: row.id,
    body: row.body,
    status: row.status,
    theme: row.theme,
    rank: row.rank,
    duplicateOf: row.duplicateOf,
    note: row.note,
    answerState: row.answerState,
    triagedBy: row.triagedBy,
  };
}
