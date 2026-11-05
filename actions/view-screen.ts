import { defineAction } from "@agent-native/core/action";
import { readAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import {
  boardQuestions,
  parsePulse,
  requireSession,
  sessionQuestions,
} from "../server/lib/floor.js";

interface Navigation {
  view?: string;
  sessionId?: string;
  tab?: string;
}

interface Selection {
  kind?: string;
  sessionId?: string;
  questionId?: string;
}

export default defineAction({
  description:
    "See what the moderator is looking at: the current view, the open session with live stats and the stage question, and the question they selected. Basic navigation is already in <current-screen>; call this for fresh session details before acting on 'this question' or 'this session'.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = (await readAppState("navigation")) as Navigation | null;
    const selection = (await readAppState("selection")) as Selection | null;
    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;

    const sessionId = navigation?.sessionId;
    if (sessionId) {
      try {
        const session = await requireSession(sessionId);
        const board = boardQuestions(await sessionQuestions(session.id));
        const byId = new Map(board.map((q) => [q.id, q]));
        const brief = (id: string | null | undefined) => {
          const q = id ? byId.get(id) : undefined;
          return q
            ? {
                id: q.id,
                body: q.body,
                status: q.status,
                theme: q.theme,
                totalVotes: q.totalVotes,
                duplicates: q.duplicates.length,
                answerState: q.answerState,
                answer: q.answer,
                note: q.note,
              }
            : null;
        };
        screen.session = {
          id: session.id,
          title: session.title,
          code: session.code,
          status: session.status,
          autopilot: Boolean(session.autopilot),
          hasBriefing: session.briefing.trim().length > 0,
          pulse: parsePulse(session.pulse)?.summary ?? null,
          stats: {
            total: board.length,
            untriaged: board.filter((q) => q.status === "new" && !q.triagedBy).length,
            queued: board.filter((q) => q.status === "queued").length,
            drafts: board.filter((q) => q.answerState === "draft").length,
            hidden: board.filter((q) => q.status === "hidden").length,
          },
          onStage: brief(session.stageQuestionId),
          upNext: board
            .filter((q) => q.status === "queued" && q.id !== session.stageQuestionId)
            .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || b.totalVotes - a.totalVotes)
            .slice(0, 5)
            .map((q) => ({ id: q.id, body: q.body, totalVotes: q.totalVotes })),
        };
        if (selection?.kind === "floor.question" && selection.sessionId === session.id) {
          screen.selectedQuestion = brief(selection.questionId);
        }
      } catch {
        screen.session = { id: sessionId, error: "Session not found or not accessible." };
      }
    }

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
