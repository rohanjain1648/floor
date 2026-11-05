import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import { appPath } from "@agent-native/core/client/api-path";
import { setClientAppState } from "@agent-native/core/client/application-state";
import { useDbSync } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import {
  IconChevronDown,
  IconCopy,
  IconExternalLink,
  IconPresentation,
  IconSparkles,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import { MiniMarkdown } from "@/components/floor/MiniMarkdown";
import { QrCode } from "@/components/floor/QrCode";
import { QuestionCard } from "@/components/floor/QuestionCard";
import { useBoard, type QuestionPatchInput } from "@/components/floor/use-board";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  displayUrl,
  joinUrl,
  upNextOrder,
  type BoardQuestion,
  type Pulse,
  type SessionStatus,
} from "@/lib/floor";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Board · Floor" }];
}

type BoardSession = {
  id: string;
  code: string;
  title: string;
  status: SessionStatus;
  autopilot: boolean;
  briefing: string;
  stageQuestionId: string | null;
  pulse: Pulse | null;
  recap: string | null;
};

function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/**
 * Autopilot hands new questions to the agent in batches. It waits a few
 * seconds so a burst becomes one run, and won't send again until the agent
 * has made progress or 90 s pass.
 */
function useAutopilot(session: BoardSession, untriaged: number) {
  const sentRef = useRef<{ at: number; count: number } | null>(null);
  useEffect(() => {
    if (sentRef.current && untriaged < sentRef.current.count) sentRef.current = null;
  }, [untriaged]);
  useEffect(() => {
    if (!session.autopilot || session.status === "ended" || untriaged === 0) return;
    const sent = sentRef.current;
    const wait = Math.max(sent ? sent.at + 90_000 - Date.now() : 0, 0) + 4_000;
    const timer = window.setTimeout(() => {
      sentRef.current = { at: Date.now(), count: untriaged };
      sendToAgentChat({
        message: `Autopilot: triage the ${untriaged} new question${untriaged === 1 ? "" : "s"} in “${session.title}”.`,
        context: `sessionId: ${session.id}\nFollow the co-moderation skill: get-session include=untriaged, one triage-questions call, then refresh the pulse if themes shifted. Keep the reply to one line.`,
        submit: true,
        background: true,
        usageLabel: "Floor autopilot",
      });
    }, wait);
    return () => window.clearTimeout(timer);
  }, [session.autopilot, session.status, session.id, session.title, untriaged]);
}

function BoardSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <Skeleton className="h-10 w-2/3 rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-28 rounded-xl" />
            <Skeleton className="h-28 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Column({
  title,
  count,
  children,
  empty,
  accent,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  empty: string;
  accent?: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {accent}
        {title}
        <span className="tabular-nums text-foreground/70">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  live: "floor.statusLive",
  paused: "floor.statusPaused",
  ended: "floor.statusEnded",
};

export default function SessionBoardRoute() {
  const t = useT();
  const { sessionId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "board";
  const queryClient = useQueryClient();
  useDbSync({
    queryClient,
    realtime: { reason: "audience questions and votes arrive while the board is open" },
  });
  useTick(20_000);
  const { query, updateQuestion, setStage, updateSession } = useBoard(sessionId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);

  const data = query.data as
    | {
        session: BoardSession;
        stats: Record<string, number>;
        questions: BoardQuestion[];
      }
    | undefined;
  const session = data?.session;
  const questions = data?.questions ?? [];
  const untriaged = questions.filter((q) => q.status === "new" && !q.triagedBy).length;
  const drafts = questions.filter((q) => q.answerState === "draft").length;

  useAutopilot(
    session ?? {
      id: sessionId,
      code: "",
      title: "",
      status: "ended",
      autopilot: false,
      briefing: "",
      stageQuestionId: null,
      pulse: null,
      recap: null,
    },
    untriaged,
  );

  useEffect(() => () => void setClientAppState("selection", null, { keepalive: true }), []);

  const columns = useMemo(() => {
    const visible = themeFilter ? questions.filter((q) => q.theme === themeFilter) : questions;
    const stageId = session?.stageQuestionId;
    return {
      inbox: visible
        .filter((q) => q.status === "new")
        .sort((a, b) => Number(!!a.triagedBy) - Number(!!b.triagedBy) || b.createdAt.localeCompare(a.createdAt)),
      upNext: visible
        .filter((q) => q.status === "queued")
        .sort((a, b) => Number(b.id === stageId) - Number(a.id === stageId) || upNextOrder(a, b)),
      answered: visible
        .filter((q) => q.status === "answered")
        .sort((a, b) => (b.answeredAt ?? "").localeCompare(a.answeredAt ?? "")),
      hidden: visible.filter((q) => q.status === "hidden"),
    };
  }, [questions, themeFilter, session?.stageQuestionId]);

  if (query.isPending) return <BoardSkeleton />;
  if (!session) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">{t("floor.sessionNotFound")}</p>
        <Link className="mt-3 inline-block text-sm underline" to="/floor">
          {t("floor.backToSessions")}
        </Link>
      </div>
    );
  }

  const link = joinUrl(session.code);
  const mergeTargets = questions.filter((q) => q.status !== "hidden");
  const agentContext = `sessionId: ${session.id}\nsession title: ${session.title}`;

  function select(q: BoardQuestion) {
    setSelectedId(q.id);
    void setClientAppState(
      "selection",
      {
        kind: "floor.question",
        sessionId: session!.id,
        questionId: q.id,
        label: q.body.slice(0, 120),
        capturedAt: Date.now(),
      },
      { keepalive: true },
    );
  }

  function patch(input: QuestionPatchInput) {
    updateQuestion.mutate(input);
  }

  function stage(questionId: string | null) {
    setStage.mutate({ sessionId: session!.id, questionId });
  }

  function askAgent(q: BoardQuestion) {
    select(q);
    sendToAgentChat({
      message: `Draft an answer to: “${q.body}”`,
      context: `${agentContext}\nquestionId: ${q.id}\nUse only the session briefing. Save it as a draft with update-question.`,
      submit: true,
      openSidebar: true,
    });
  }

  function triageNow() {
    sendToAgentChat({
      message: untriaged
        ? `Triage the ${untriaged} new question${untriaged === 1 ? "" : "s"}.`
        : "Re-check the board: merge any duplicates I missed and re-rank Up next.",
      context: `${agentContext}\nFollow the co-moderation skill.`,
      submit: true,
      openSidebar: true,
    });
  }

  function copyLink() {
    void navigator.clipboard?.writeText(link).then(
      () => toast.success(t("floor.linkCopied")),
      () => toast.error(t("floor.copyFailed")),
    );
  }

  const briefingValue = briefing ?? session.briefing;
  const themes = session.pulse?.themes ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <span className="floor-tally" data-state={session.status} />
              {t(STATUS_LABEL[session.status])}
              <IconChevronDown className="size-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(["live", "paused", "ended"] as const).map((status) => (
              <DropdownMenuItem
                key={status}
                onSelect={() => updateSession.mutate({ id: session.id, status })}
              >
                <span className="floor-tally" data-state={status} />
                {t(STATUS_LABEL[status])}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
          {session.title}
        </h1>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="font-mono tracking-widest">
              {session.code}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <QrCode value={link} label={t("floor.qrLabel")} className="mx-auto size-44" />
            <p className="break-all text-center text-sm font-medium">{displayUrl(link)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={copyLink}>
                <IconCopy className="size-4" />
                {t("floor.copyLink")}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" asChild>
                <a href={link} target="_blank" rel="noreferrer">
                  <IconExternalLink className="size-4" />
                  {t("floor.openAudience")}
                </a>
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        <Button size="sm" variant="outline" asChild>
          <a href={appPath(`/stage/${session.id}`)} target="_blank" rel="noreferrer">
            <IconPresentation className="size-4" />
            {t("floor.stage")}
          </a>
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-[hsl(var(--floor-agent-soft)/0.6)] px-4 py-2 sm:px-6">
        <label className="flex items-center gap-2 text-sm font-medium">
          <IconSparkles className="floor-agent-mark size-4" />
          {t("floor.autopilot")}
          <Switch
            checked={session.autopilot}
            onCheckedChange={(checked) => updateSession.mutate({ id: session.id, autopilot: checked })}
            aria-label={t("floor.autopilot")}
          />
        </label>
        <Button size="sm" variant="outline" onClick={triageNow}>
          {untriaged ? t("floor.triageCount", { count: untriaged }) : t("floor.recheck")}
        </Button>
        {drafts ? (
          <span className="floor-agent-mark text-xs font-medium">
            {t("floor.draftsWaiting", { count: drafts })}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1.5">
          {session.pulse ? (
            <p className="me-1 min-w-0 truncate text-xs text-muted-foreground" title={session.pulse.summary}>
              {session.pulse.summary}
            </p>
          ) : null}
          {themes.map((theme) => (
            <button
              key={theme.name}
              type="button"
              aria-pressed={themeFilter === theme.name}
              onClick={() => setThemeFilter((current) => (current === theme.name ? null : theme.name))}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs transition-colors",
                themeFilter === theme.name
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:border-foreground/40",
              )}
            >
              {theme.name} <span className="tabular-nums opacity-70">{theme.count}</span>
            </button>
          ))}
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(searchParams);
          if (value === "board") next.delete("tab");
          else next.set("tab", value);
          setSearchParams(next, { replace: true });
        }}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-3 self-start sm:mx-6">
          <TabsTrigger value="board">{t("floor.tabBoard")}</TabsTrigger>
          <TabsTrigger value="briefing">{t("floor.tabBriefing")}</TabsTrigger>
          <TabsTrigger value="recap">{t("floor.tabRecap")}</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="px-4 pb-8 pt-3 sm:px-6">
          {questions.length === 0 ? (
            <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-4 text-center">
              <QrCode value={link} label={t("floor.qrLabel")} className="size-40" />
              <p className="text-sm text-muted-foreground">{t("floor.emptyBoard")}</p>
              <p className="font-mono text-lg font-semibold tracking-widest">{displayUrl(link)}</p>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-3">
              <Column title={t("floor.colInbox")} count={columns.inbox.length} empty={t("floor.emptyInbox")}>
                {columns.inbox.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    variant="inbox"
                    selected={selectedId === q.id}
                    mergeTargets={mergeTargets}
                    onPatch={patch}
                    onStageChange={stage}
                    onSelect={select}
                    onAskAgent={askAgent}
                  />
                ))}
              </Column>
              <Column
                title={t("floor.colUpNext")}
                count={columns.upNext.length}
                empty={t("floor.emptyUpNext")}
                accent={<span className="floor-tally" data-state={session.stageQuestionId ? "live" : "ended"} />}
              >
                {columns.upNext.map((q, index) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    variant="upnext"
                    onStage={q.id === session.stageQuestionId}
                    position={session.stageQuestionId ? index : index + 1}
                    selected={selectedId === q.id}
                    mergeTargets={mergeTargets}
                    onPatch={patch}
                    onStageChange={stage}
                    onSelect={select}
                    onAskAgent={askAgent}
                  />
                ))}
              </Column>
              <Column title={t("floor.colAnswered")} count={columns.answered.length} empty={t("floor.emptyAnswered")}>
                {columns.answered.map((q) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    variant="answered"
                    selected={selectedId === q.id}
                    mergeTargets={mergeTargets}
                    onPatch={patch}
                    onStageChange={stage}
                    onSelect={select}
                    onAskAgent={askAgent}
                  />
                ))}
                {columns.hidden.length ? (
                  <details className="group mt-3">
                    <summary className="cursor-pointer list-none px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("floor.colHidden")} <span className="tabular-nums">{columns.hidden.length}</span>
                    </summary>
                    <div className="mt-2 space-y-2.5">
                      {columns.hidden.map((q) => (
                        <QuestionCard
                          key={q.id}
                          question={q}
                          variant="hidden"
                          mergeTargets={mergeTargets}
                          onPatch={patch}
                          onStageChange={stage}
                          onSelect={select}
                          onAskAgent={askAgent}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </Column>
            </div>
          )}
        </TabsContent>

        <TabsContent value="briefing" className="px-4 pb-8 pt-3 sm:px-6">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm text-muted-foreground">{t("floor.briefingHelp")}</p>
            <Textarea
              value={briefingValue}
              onChange={(event) => setBriefing(event.target.value)}
              rows={16}
              maxLength={20000}
              placeholder={t("floor.briefingPlaceholder")}
              aria-label={t("floor.tabBriefing")}
              className="font-mono text-sm"
            />
            <div className="flex gap-2">
              <Button
                disabled={briefing === null || briefing === session.briefing}
                onClick={() =>
                  updateSession.mutate(
                    { id: session.id, briefing: briefingValue },
                    {
                      onSuccess: () => {
                        setBriefing(null);
                        toast.success(t("floor.briefingSaved"));
                      },
                    },
                  )
                }
              >
                {t("floor.saveBriefing")}
              </Button>
              {briefing !== null && briefing !== session.briefing ? (
                <Button variant="ghost" onClick={() => setBriefing(null)}>
                  {t("floor.cancel")}
                </Button>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="recap" className="px-4 pb-8 pt-3 sm:px-6">
          <div className="max-w-3xl space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  sendToAgentChat({
                    message: session.recap ? "Update the recap for this session." : "Write the recap for this session.",
                    context: `${agentContext}\nFollow the recap format in the co-moderation skill and save it with update-session.`,
                    submit: true,
                    openSidebar: true,
                  })
                }
              >
                <IconSparkles className="size-4" />
                {session.recap ? t("floor.updateRecap") : t("floor.writeRecap")}
              </Button>
              {session.recap ? (
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard?.writeText(session.recap ?? "").then(
                      () => toast.success(t("floor.recapCopied")),
                      () => toast.error(t("floor.copyFailed")),
                    )
                  }
                >
                  <IconCopy className="size-4" />
                  {t("floor.copyMarkdown")}
                </Button>
              ) : null}
            </div>
            {session.recap ? (
              <article className="rounded-xl border border-border bg-card p-5">
                <MiniMarkdown source={session.recap} />
              </article>
            ) : (
              <p className="text-sm text-muted-foreground">{t("floor.recapEmpty")}</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
