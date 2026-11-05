import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import type { BoardQuestion, QuestionStatus } from "@/lib/floor";

export interface QuestionPatchInput {
  id: string;
  status?: QuestionStatus;
  theme?: string | null;
  duplicateOf?: string | null;
  rank?: number | null;
  note?: string | null;
  answer?: string | null;
  answerState?: "none" | "draft" | "published";
}

type BoardData = { questions: BoardQuestion[] } & Record<string, unknown>;

function applyLocally(
  questions: BoardQuestion[],
  input: QuestionPatchInput,
): BoardQuestion[] {
  const source = questions.find((q) => q.id === input.id);
  if (!source) return questions;
  if (typeof input.duplicateOf === "string") {
    const target = questions.find((q) => q.id === input.duplicateOf);
    if (!target) return questions;
    return questions
      .filter((q) => q.id !== source.id)
      .map((q) =>
        q.id === target.id
          ? {
              ...q,
              totalVotes: q.totalVotes + source.totalVotes,
              duplicates: [
                ...q.duplicates,
                {
                  id: source.id,
                  body: source.body,
                  authorName: source.authorName,
                  votes: source.votes,
                },
                ...source.duplicates,
              ],
            }
          : q,
      );
  }
  return questions.map((q) => {
    if (q.id !== input.id) return q;
    const next: BoardQuestion = { ...q, triagedBy: "host" };
    if (input.status !== undefined) {
      next.status = input.status;
      if (input.note === undefined) next.note = null;
    }
    if (input.theme !== undefined) next.theme = input.theme;
    if (input.rank !== undefined) next.rank = input.rank;
    if (input.note !== undefined) next.note = input.note;
    if (input.answer !== undefined) {
      next.answer = input.answer || null;
      if (!input.answer) next.answerState = "none";
      else if (next.answerState === "none") next.answerState = "draft";
    }
    if (input.answerState === "published") {
      next.answerState = "published";
      if (input.status === undefined) next.status = "answered";
    } else if (input.answerState === "none") {
      next.answer = null;
      next.answerState = "none";
    }
    return next;
  });
}

export function useBoard(sessionId: string) {
  const t = useT();
  const queryClient = useQueryClient();
  const params = useMemo(
    () => ({ id: sessionId, include: "all" as const }),
    [sessionId],
  );
  const queryKey = useMemo(() => ["action", "get-session", params], [params]);
  const query = useActionQuery("get-session", params);

  function snapshot() {
    return queryClient.getQueryData(queryKey);
  }
  function restore(context: unknown) {
    queryClient.setQueryData(
      queryKey,
      (context as { previous?: unknown } | undefined)?.previous,
    );
  }

  const updateQuestion = useActionMutation("update-question", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = snapshot();
      queryClient.setQueryData(queryKey, (old: BoardData | undefined) =>
        old
          ? {
              ...old,
              questions: applyLocally(old.questions, input as QuestionPatchInput),
            }
          : old,
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      restore(context);
      toast.error(actionErrorMessage(error) ?? t("floor.saveFailed"));
    },
  });

  const setStage = useActionMutation("set-stage", {
    onError: (error) =>
      toast.error(actionErrorMessage(error) ?? t("floor.saveFailed")),
  });

  const updateSession = useActionMutation("update-session", {
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = snapshot();
      queryClient.setQueryData(
        queryKey,
        (old: { session: Record<string, unknown> } | undefined) =>
          old
            ? {
                ...old,
                session: {
                  ...old.session,
                  ...Object.fromEntries(
                    Object.entries(input).filter(
                      ([key, value]) => key !== "id" && value !== undefined,
                    ),
                  ),
                },
              }
            : old,
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      restore(context);
      toast.error(actionErrorMessage(error) ?? t("floor.saveFailed"));
    },
  });

  return { query, updateQuestion, setStage, updateSession };
}
