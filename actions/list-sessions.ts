import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the live Q&A sessions the current user can moderate, newest first, with question counts.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "floor", to: "/floor" }),
    label: "Open sessions",
  }),
  run: async () => {
    const { floorSessions, floorSessionShares, floorQuestions } = schema;
    const db = getDb();
    const sessions = await db
      .select({
        id: floorSessions.id,
        code: floorSessions.code,
        title: floorSessions.title,
        status: floorSessions.status,
        autopilot: floorSessions.autopilot,
        createdAt: floorSessions.createdAt,
      })
      .from(floorSessions)
      .where(accessFilter(floorSessions, floorSessionShares))
      .orderBy(desc(floorSessions.createdAt))
      .limit(100);
    if (!sessions.length) return { sessions: [] };

    const counts = await db
      .select({
        sessionId: floorQuestions.sessionId,
        total: sql<number>`count(*)::int`,
        untriaged: sql<number>`count(*) filter (where ${floorQuestions.triagedBy} is null and ${floorQuestions.status} = 'new')::int`,
      })
      .from(floorQuestions)
      .where(
        and(
          inArray(
            floorQuestions.sessionId,
            sessions.map((s) => s.id),
          ),
          sql`${floorQuestions.duplicateOf} is null`,
        ),
      )
      .groupBy(floorQuestions.sessionId);
    const bySession = new Map(counts.map((c) => [c.sessionId, c]));
    return {
      sessions: sessions.map((s) => ({
        ...s,
        autopilot: Boolean(s.autopilot),
        questionCount: bySession.get(s.id)?.total ?? 0,
        untriagedCount: bySession.get(s.id)?.untriaged ?? 0,
      })),
    };
  },
});
