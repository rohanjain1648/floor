import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { insertQuestion, requireSession } from "../server/lib/floor.js";

export default defineAction({
  description:
    "Add a question to a session on someone's behalf, e.g. one asked at the room mic or forwarded by chat. Audience members normally ask from /j/<code>.",
  schema: z.object({
    sessionId: z.string().describe("Session id"),
    body: z.string().describe("The question, 3-280 characters"),
    authorName: z
      .string()
      .max(40)
      .optional()
      .describe('Who asked, e.g. "Room mic" or a first name'),
  }),
  run: async (args, ctx) => {
    const email =
      ctx?.userEmail ?? fail("Sign in to add questions.", { statusCode: 401 });
    const session = await requireSession(args.sessionId, "editor");
    const row = await insertQuestion(
      session,
      {
        body: args.body,
        authorName: args.authorName ?? "Moderator",
        authorToken: `host:${email}`,
      },
      { enforceLimits: false },
    );
    return { id: row.id, sessionId: session.id, body: row.body, status: row.status };
  },
});
