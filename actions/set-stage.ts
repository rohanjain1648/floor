import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  actorFor,
  notifySession,
  requireSession,
  sessionChangeResource,
} from "../server/lib/floor.js";

export default defineAction({
  description:
    "Put a question on the stage screen for the speaker to answer live, or clear the stage with questionId null. The question that was on stage is marked answered.",
  schema: z.object({
    sessionId: z.string().describe("Session id"),
    questionId: z
      .string()
      .nullable()
      .describe("Canonical question id to show, or null to clear the stage"),
  }),
  changeResource: (input) => sessionChangeResource(input.sessionId),
  run: async ({ sessionId, questionId }, ctx) => {
    const session = await requireSession(sessionId, "editor");
    const q = schema.floorQuestions;
    const now = new Date().toISOString();
    const actor = actorFor(ctx?.caller);
    await getDb().transaction(async (tx) => {
      if (questionId) {
        const [target] = await tx
          .select({ id: q.id, status: q.status })
          .from(q)
          .where(
            and(eq(q.id, questionId), eq(q.sessionId, session.id), isNull(q.duplicateOf)),
          )
          .limit(1);
        if (!target) {
          fail("That question isn't in this session (or is merged into another).", {
            errorCode: "not_found",
            statusCode: 404,
          });
        }
        if (target.status === "hidden") {
          fail("Restore the question before putting it on stage.", {
            errorCode: "question_hidden",
            statusCode: 409,
          });
        }
      }
      const previous = session.stageQuestionId;
      if (previous && previous !== questionId) {
        await tx
          .update(q)
          .set({ status: "answered", answeredAt: now, rank: null })
          .where(and(eq(q.id, previous), eq(q.sessionId, session.id)));
      }
      if (questionId) {
        await tx
          .update(q)
          .set({ status: "queued", rank: null, triagedBy: actor, triagedAt: now })
          .where(eq(q.id, questionId));
      }
      await tx
        .update(schema.floorSessions)
        .set({ stageQuestionId: questionId })
        .where(eq(schema.floorSessions.id, session.id));
    });
    notifySession(session);
    return { sessionId: session.id, stageQuestionId: questionId };
  },
});
