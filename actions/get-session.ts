import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  boardQuestions,
  parsePulse,
  requireSession,
  sessionQuestions,
} from "../server/lib/floor.js";

export default defineAction({
  description:
    "Read one session: settings, briefing, live stats and its questions. Duplicates are folded under their canonical question with votes rolled up. Use include='untriaged' to get only questions nobody has sorted yet plus a compact list of existing questions to match duplicates against.",
  schema: z.object({
    id: z.string().describe("Session id"),
    include: z
      .enum(["all", "untriaged", "none"])
      .default("all")
      .describe("Which questions to return"),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "floor",
      to: `/floor/${encodeURIComponent(args.id)}`,
      params: { sessionId: args.id },
    }),
    label: "Open board",
  }),
  run: async ({ id, include }) => {
    const session = await requireSession(id);
    const rows = await sessionQuestions(session.id);
    const board = boardQuestions(rows);
    const untriaged = board.filter((q) => q.status === "new" && !q.triagedBy);
    const stats = {
      total: board.length,
      untriaged: untriaged.length,
      queued: board.filter((q) => q.status === "queued").length,
      answered: board.filter((q) => q.status === "answered").length,
      hidden: board.filter((q) => q.status === "hidden").length,
      drafts: board.filter((q) => q.answerState === "draft").length,
      merged: rows.filter((r) => r.duplicateOf).length,
      votes: rows.reduce((sum, r) => sum + r.votes, 0),
    };
    const summary = {
      id: session.id,
      code: session.code,
      title: session.title,
      status: session.status,
      autopilot: Boolean(session.autopilot),
      briefing: session.briefing,
      stageQuestionId: session.stageQuestionId,
      pulse: parsePulse(session.pulse),
      recap: session.recap,
      joinPath: `/j/${session.code}`,
      createdAt: session.createdAt,
    };
    if (include === "none") return { session: summary, stats, questions: [] };
    if (include === "untriaged") {
      return {
        session: summary,
        stats,
        questions: untriaged,
        existing: board
          .filter((q) => q.triagedBy || q.status !== "new")
          .map((q) => ({
            id: q.id,
            body: q.body,
            theme: q.theme,
            status: q.status,
            rank: q.rank,
            totalVotes: q.totalVotes,
          })),
      };
    }
    return { session: summary, stats, questions: board };
  },
});
