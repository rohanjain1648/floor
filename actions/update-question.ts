import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
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

type UpdatedQuestion = ReturnType<typeof questionSummary> & { sessionId: string };

export default defineAction({
  description:
    "Patch one question: queue, hide or restore it, mark it answered, set its theme or rank, merge it (duplicateOf) or split it out (duplicateOf: null), or write/approve its answer. Agent answers stay drafts until a person publishes them.",
  schema: z.object({
    id: z.string().describe("Question id"),
    ...questionPatchFields,
  }),
  changeResource: (_input, result: UpdatedQuestion | undefined) =>
    sessionChangeResource(result?.sessionId),
  run: async (args, ctx): Promise<UpdatedQuestion> => {
    const [row] = await getDb()
      .select({ sessionId: schema.floorQuestions.sessionId })
      .from(schema.floorQuestions)
      .where(eq(schema.floorQuestions.id, args.id))
      .limit(1);
    if (!row) fail("Question not found.", { errorCode: "not_found", statusCode: 404 });
    const session = await requireSession(row.sessionId, "editor");
    const changed = await applyQuestionPatches(
      session,
      [args],
      actorFor(ctx?.caller),
    );
    const updated = changed.find((q) => q.id === args.id);
    if (!updated) fail("Question not found.", { errorCode: "not_found", statusCode: 404 });
    return { sessionId: session.id, ...questionSummary(updated) };
  },
});
