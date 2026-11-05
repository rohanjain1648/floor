import { registerEvent } from "@agent-native/core/event-bus";
import { defineNitroPlugin } from "@agent-native/core/server";
import { z } from "zod";

import { QUESTION_SUBMITTED_EVENT } from "../lib/floor.js";

// Lets people build automations on live audience activity, e.g. "when someone
// asks about pricing in my session, message me" — no code changes needed.
export default defineNitroPlugin(() => {
  registerEvent({
    name: QUESTION_SUBMITTED_EVENT,
    description:
      "An audience member asked a question in a live Floor session. Fires once per question.",
    payloadSchema: z.object({
      sessionId: z.string(),
      sessionTitle: z.string(),
      questionId: z.string(),
      body: z.string(),
      authorName: z.string().nullable(),
    }),
    example: {
      sessionId: "6f1c2a3e-0000-4000-8000-000000000000",
      sessionTitle: "Agent-Native office hours",
      questionId: "9b2d4c1a-0000-4000-8000-000000000000",
      body: "Can I deploy an Agent-Native app to Cloudflare?",
      authorName: "Priya",
    },
  });
});
