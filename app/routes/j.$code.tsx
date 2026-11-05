import { appPath } from "@agent-native/core/client/api-path";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowBigUp,
  IconArrowBigUpFilled,
  IconCheck,
  IconSend,
  IconSparkles,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo, type Pulse, type QuestionStatus, type SessionStatus } from "@/lib/floor";
import { cn } from "@/lib/utils";

export function meta() {
  return [
    { title: "Ask a question · Floor" },
    { name: "robots", content: "noindex" },
  ];
}

interface PublicQuestion {
  id: string;
  body: string;
  authorName: string | null;
  votes: number;
  status: QuestionStatus;
  theme: string | null;
  mergedCount: number;
  answer: string | null;
  answerBy: "agent" | "host" | null;
  onStage: boolean;
  createdAt: string;
  voted: boolean;
}

interface MyQuestion {
  id: string;
  body: string;
  status: QuestionStatus;
  mergedInto: { id: string; body: string } | null;
  answer: string | null;
  createdAt: string;
}

interface Snapshot {
  session: {
    code: string;
    title: string;
    status: SessionStatus;
    stageQuestionId: string | null;
    pulse: Pick<Pulse, "summary" | "themes"> | null;
  };
  questions: PublicQuestion[];
  mine: MyQuestion[];
}

const TOKEN_KEY = "floor.voter";
const NAME_KEY = "floor.name";
const MAX = 280;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the token lives for this page only.
  }
}

function useVoterToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let value = readStorage(TOKEN_KEY);
    if (!value || !/^[A-Za-z0-9_-]{16,64}$/.test(value)) {
      value = crypto.randomUUID().replace(/-/g, "");
      writeStorage(TOKEN_KEY, value);
    }
    setToken(value);
  }, []);
  return token;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { message?: string };
  if (!res.ok) throw new Error(json.message ?? "Request failed");
  return json;
}

type Tab = "top" | "recent" | "answered" | "mine";

export default function AudienceRoute() {
  const t = useT();
  const { code = "" } = useParams();
  const token = useVoterToken();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("top");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const base = appPath(`/api/public/floor/${encodeURIComponent(code)}`);
  const queryKey = useMemo(() => ["floor-public", code, token], [code, token]);

  useEffect(() => setName(readStorage(NAME_KEY) ?? ""), []);

  const query = useQuery({
    queryKey,
    enabled: Boolean(token),
    queryFn: async (): Promise<Snapshot | null> => {
      const res = await fetch(`${base}?token=${encodeURIComponent(token ?? "")}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Could not load the session");
      return (await res.json()) as Snapshot;
    },
    refetchInterval: 2500,
    placeholderData: (previous) => previous,
  });

  const ask = useMutation({
    mutationFn: () =>
      postJson<{ id: string }>(`${base}/questions`, {
        body,
        authorName: name.trim() || undefined,
        token,
      }),
    onSuccess: () => {
      setBody("");
      setTab("mine");
      toast.success(t("floor.asked"));
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const vote = useMutation({
    mutationFn: (questionId: string) => postJson(`${base}/votes`, { questionId, token }),
    onMutate: async (questionId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Snapshot | null>(queryKey);
      queryClient.setQueryData<Snapshot | null>(queryKey, (old) =>
        old
          ? {
              ...old,
              questions: old.questions.map((q) =>
                q.id === questionId
                  ? { ...q, voted: !q.voted, votes: q.votes + (q.voted ? -1 : 1) }
                  : q,
              ),
            }
          : old,
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      queryClient.setQueryData(queryKey, context?.previous);
      toast.error(error.message);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const snapshot = query.data;
  const lists = useMemo(() => {
    const qs = snapshot?.questions ?? [];
    const open = qs.filter((q) => q.status !== "answered");
    return {
      top: [...open].sort((a, b) => b.votes - a.votes || b.createdAt.localeCompare(a.createdAt)),
      recent: [...open].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      answered: qs.filter((q) => q.status === "answered" || q.answer),
    };
  }, [snapshot]);

  if (query.isPending || !token) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-3 px-4 py-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="font-mono text-lg tracking-widest">{code.toUpperCase()}</p>
        <p className="text-sm text-muted-foreground">{t("floor.noSuchSession")}</p>
      </div>
    );
  }

  const { session } = snapshot;
  const stage = snapshot.questions.find((q) => q.onStage);
  const canAsk = session.status === "live";
  const shown = tab === "mine" ? [] : lists[tab];
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "top", label: t("floor.tabTop"), count: lists.top.length },
    { id: "recent", label: t("floor.tabRecent"), count: lists.recent.length },
    { id: "answered", label: t("floor.tabAnswered"), count: lists.answered.length },
    { id: "mine", label: t("floor.tabMine"), count: snapshot.mine.length },
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 pb-10 pt-5">
      <header className="flex items-center gap-2.5">
        <span className="floor-tally shrink-0" data-state={session.status} />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{session.title}</h1>
        <span className="font-mono text-xs tracking-widest text-muted-foreground">{session.code}</span>
      </header>

      {stage ? (
        <section className="floor-card mt-4 rounded-2xl border border-[hsl(var(--floor-live)/0.4)] bg-[hsl(var(--floor-live)/0.06)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--floor-live))]">
            {t("floor.nowAnswering")}
          </p>
          <p className="mt-1 text-base font-medium leading-snug [overflow-wrap:anywhere]">{stage.body}</p>
        </section>
      ) : null}

      <form
        className="mt-4 rounded-2xl border border-border bg-card p-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (body.trim().length >= 3 && canAsk) ask.mutate();
        }}
      >
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value.slice(0, MAX))}
          placeholder={canAsk ? t("floor.askPlaceholder") : t(session.status === "paused" ? "floor.pausedNotice" : "floor.endedNotice")}
          aria-label={t("floor.askPlaceholder")}
          disabled={!canAsk}
          rows={3}
          className="resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0"
        />
        <div className="mt-2 flex items-center gap-2">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              writeStorage(NAME_KEY, event.target.value);
            }}
            placeholder={t("floor.namePlaceholder")}
            aria-label={t("floor.namePlaceholder")}
            maxLength={40}
            disabled={!canAsk}
            className="h-9 flex-1"
          />
          <span className="text-xs tabular-nums text-muted-foreground">{MAX - body.length}</span>
          <Button type="submit" size="sm" disabled={!canAsk || body.trim().length < 3 || ask.isPending}>
            <IconSend className="size-4" />
            {t("floor.send")}
          </Button>
        </div>
      </form>

      {session.pulse ? (
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t("floor.roomPulse")}:</span> {session.pulse.summary}
        </p>
      ) : null}

      <nav className="mt-4 grid grid-cols-4 gap-1 rounded-xl bg-muted p-1" aria-label={t("floor.questionLists")}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "rounded-lg px-1 py-1.5 text-xs font-medium transition-colors",
              tab === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {item.label}
            <span className="ms-1 tabular-nums opacity-60">{item.count}</span>
          </button>
        ))}
      </nav>

      <ul className="mt-3 space-y-2.5">
        {tab === "mine"
          ? snapshot.mine.length === 0
            ? <li className="py-10 text-center text-sm text-muted-foreground">{t("floor.mineEmpty")}</li>
            : [...snapshot.mine].reverse().map((q) => (
                <li key={q.id} className="floor-card rounded-xl border border-border bg-card p-3">
                  <p className="text-sm leading-snug [overflow-wrap:anywhere]">{q.body}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {q.mergedInto
                      ? t("floor.mineMerged", { body: q.mergedInto.body })
                      : t(
                          q.status === "queued"
                            ? "floor.mineQueued"
                            : q.status === "answered"
                              ? "floor.mineAnswered"
                              : q.status === "hidden"
                                ? "floor.mineHidden"
                                : "floor.mineWaiting",
                        )}
                  </p>
                  {q.answer ? (
                    <p className="mt-2 rounded-lg bg-[hsl(var(--floor-ok)/0.08)] p-2 text-sm leading-snug">{q.answer}</p>
                  ) : null}
                </li>
              ))
          : shown.length === 0
            ? <li className="py-10 text-center text-sm text-muted-foreground">{t("floor.listEmpty")}</li>
            : shown.map((q) => (
                <li
                  key={q.id}
                  className={cn(
                    "floor-card flex gap-3 rounded-xl border border-border bg-card p-3",
                    q.onStage && "border-[hsl(var(--floor-live)/0.5)]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => vote.mutate(q.id)}
                    aria-pressed={q.voted}
                    aria-label={t(q.voted ? "floor.unvote" : "floor.upvote")}
                    disabled={session.status === "ended" || q.status === "answered"}
                    className={cn(
                      "flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-xs font-semibold tabular-nums transition-colors active:scale-95",
                      q.voted
                        ? "border-[hsl(var(--floor-heat))] bg-[hsl(var(--floor-heat)/0.12)] text-[hsl(var(--floor-heat))]"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {q.voted ? <IconArrowBigUpFilled className="size-4" /> : <IconArrowBigUp className="size-4" />}
                    {q.votes}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug [overflow-wrap:anywhere]">{q.body}</p>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      <span>{q.authorName ?? t("floor.anonymous")}</span>
                      <span>{timeAgo(q.createdAt)}</span>
                      {q.mergedCount ? <span>{t("floor.alsoAsked", { count: q.mergedCount })}</span> : null}
                      {q.status === "queued" ? <span className="text-foreground">{t("floor.upNextBadge")}</span> : null}
                    </p>
                    {q.answer ? (
                      <div className="mt-2 rounded-lg bg-[hsl(var(--floor-ok)/0.08)] p-2.5">
                        <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--floor-ok))]">
                          {q.answerBy === "agent" ? <IconSparkles className="size-3" /> : <IconCheck className="size-3" />}
                          {t(q.answerBy === "agent" ? "floor.answerByAssistant" : "floor.answerByHost")}
                        </p>
                        <p className="text-sm leading-snug [overflow-wrap:anywhere]">{q.answer}</p>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
      </ul>
    </div>
  );
}
