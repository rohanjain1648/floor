import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  notifySession,
  requireSession,
  sessionChangeResource,
} from "../server/lib/floor.js";

export default defineAction({
  description:
    "Patch a session: rename it, edit the briefing, pause/resume/end it, toggle autopilot, or save the agent's live pulse and end-of-session recap.",
  schema: z.object({
    id: z.string().describe("Session id from list-sessions"),
    title: z.string().trim().min(1).max(120).optional(),
    briefing: z
      .string()
      .max(20000)
      .optional()
      .describe("Host notes the agent drafts answers from"),
    status: z
      .enum(["live", "paused", "ended"])
      .optional()
      .describe("live takes questions, paused stops new ones, ended closes the room"),
    autopilot: z
      .boolean()
      .optional()
      .describe("When true the board asks the agent to triage new questions as they arrive"),
    pulse: z
      .object({
        summary: z
          .string()
          .trim()
          .min(1)
          .max(280)
          .describe("One or two sentences on what the room is asking about right now"),
        themes: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(40),
              count: z.coerce.number().int().min(0).describe("Questions in this theme, duplicates included"),
            }),
          )
          .max(8),
      })
      .nullable()
      .optional()
      .describe("Live theme summary shown on the board and stage"),
    recap: z
      .string()
      .max(30000)
      .nullable()
      .optional()
      .describe("Markdown recap: answered, unanswered, follow-ups"),
  }),
  changeResource: (input) => sessionChangeResource(input.id),
  run: async (args) => {
    const session = await requireSession(args.id, "editor");
    const patch: Partial<typeof schema.floorSessions.$inferInsert> = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.briefing !== undefined) patch.briefing = args.briefing;
    if (args.status !== undefined) patch.status = args.status;
    if (args.autopilot !== undefined) patch.autopilot = args.autopilot ? 1 : 0;
    if (args.pulse !== undefined) {
      patch.pulse = args.pulse
        ? JSON.stringify({ ...args.pulse, updatedAt: new Date().toISOString() })
        : null;
    }
    if (args.recap !== undefined) patch.recap = args.recap;
    if (!Object.keys(patch).length) {
      fail("Nothing to update.", { errorCode: "empty_patch", statusCode: 400 });
    }
    await getDb()
      .update(schema.floorSessions)
      .set(patch)
      .where(eq(schema.floorSessions.id, session.id));
    notifySession(session);
    return {
      id: session.id,
      updated: Object.keys(patch),
      status: patch.status ?? session.status,
    };
  },
});
