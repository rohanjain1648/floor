import { and, eq } from "drizzle-orm";
import { defineEventHandler, getQuery } from "h3";

import { getDb, schema } from "../../../../db/index.js";
import { publicSnapshot, sessionQuestions } from "../../../../lib/floor.js";
import {
  publicError,
  sessionFromRoute,
  voterToken,
} from "../../../../lib/public-request.js";

export default defineEventHandler(async (event) => {
  const session = await sessionFromRoute(event);
  if (!session) {
    return publicError(event, 404, "not_found", "No session uses that code.");
  }
  const token = voterToken(getQuery(event).token);
  const rows = await sessionQuestions(session.id);
  let myVotes = new Set<string>();
  if (token) {
    const q = schema.floorQuestions;
    const v = schema.floorVotes;
    const votes = await getDb()
      .select({ questionId: v.questionId })
      .from(v)
      .innerJoin(q, eq(q.id, v.questionId))
      .where(and(eq(q.sessionId, session.id), eq(v.voterToken, token)))
      .limit(1000);
    myVotes = new Set(votes.map((vote) => vote.questionId));
  }
  return publicSnapshot(session, rows, token, myVotes);
});
