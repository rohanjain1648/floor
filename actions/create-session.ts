import { defineAction, fail } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { newJoinCode } from "../server/lib/floor.js";

interface CreatedSession {
  id: string;
  code: string;
  title: string;
  joinPath: string;
}

export default defineAction({
  description:
    "Open a new live Q&A session. Returns its id and the short join code the audience types at /j/<code>. Visible to the organization when one is active, otherwise only to its creator.",
  schema: z.object({
    title: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .describe('Session name shown to the audience, e.g. "Q3 all-hands"'),
    briefing: z
      .string()
      .max(20000)
      .optional()
      .describe(
        "Host notes and facts the agent may use to draft answers (agenda, FAQs, links)",
      ),
  }),
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "floor",
      to: `/floor/${encodeURIComponent(result.id)}`,
      params: { sessionId: result.id },
    }),
    label: `Open ${result.title}`,
  }),
  changeResource: (_input, result: CreatedSession) => ({
    resourceType: "floor-session",
    resourceId: result.id,
  }),
  run: async (args, ctx): Promise<CreatedSession> => {
    const ownerEmail =
      ctx?.userEmail ?? fail("Sign in to open a session.", { statusCode: 401 });
    const orgId = ctx?.orgId ?? null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const session = {
        id: crypto.randomUUID(),
        code: newJoinCode(),
        title: args.title,
        briefing: args.briefing ?? "",
        createdAt: new Date().toISOString(),
        ownerEmail,
        orgId,
        visibility: orgId ? ("org" as const) : ("private" as const),
      };
      const inserted = await getDb()
        .insert(schema.floorSessions)
        .values(session)
        .onConflictDoNothing({ target: schema.floorSessions.code })
        .returning({ id: schema.floorSessions.id });
      if (inserted.length) {
        return {
          id: session.id,
          code: session.code,
          title: session.title,
          joinPath: `/j/${session.code}`,
        };
      }
    }
    fail("Couldn't reserve a join code. Try again.", {
      errorCode: "code_exhausted",
      statusCode: 503,
    });
  },
});
