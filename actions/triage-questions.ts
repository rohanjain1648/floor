import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  actorFor,
  requireSession,
  sessionChangeResource,
} from "../server/lib/floor.js";
import {
  applyQuestionPatches,
  questionPatchFields,
  questionSummary,
} from "../server/lib/question-patch.js";

export default defineAction({
  description:
    "Sort many questions in one session at once: merge duplicates (duplicateOf), tag themes, queue or hide (with a note), rank Up next, and attach draft answers from the briefing. All edits apply in one transaction. Agent answers are saved as drafts; only a person can publish them.",
  schema: z.object({
    sessionId: z.string().describe("Session id"),
    items: z
      .array(
        z.object({
          id: z.string().describe("Question id"),
          ...questionPatchFields,
        }),
      )
      .min(1)
      .max(100),
  }),
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "floor",
      to: `/floor/${encodeURIComponent(args.sessionId)}`,
      params: { sessionId: args.sessionId },
    }),
    label: "Open board",
  }),
  changeResource: (input) => sessionChangeResource(input.sessionId),
  run: async ({ sessionId, items }, ctx) => {
    const session = await requireSession(sessionId, "editor");
    const changed = await applyQuestionPatches(
      session,
      items,
      actorFor(ctx?.caller),
    );
    return { updated: changed.length, questions: changed.map(questionSummary) };
  },
});
