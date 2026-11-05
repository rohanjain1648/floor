import { useDbSync } from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconArrowBigUpFilled } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";

import { QrCode } from "@/components/floor/QrCode";
import { useBoard } from "@/components/floor/use-board";
import {
  displayUrl,
  joinUrl,
  upNextOrder,
  type BoardQuestion,
  type Pulse,
  type SessionStatus,
} from "@/lib/floor";

export function meta() {
  return [{ title: "Stage · Floor" }];
}

export default function StageRoute() {
  const t = useT();
  const { sessionId = "" } = useParams();
  const queryClient = useQueryClient();
  useDbSync({
    queryClient,
    realtime: { reason: "the projector must follow the moderator and the audience live" },
  });
  const { query, setStage } = useBoard(sessionId);
  const [showHint, setShowHint] = useState(true);
  const hintTimer = useRef<number | undefined>(undefined);

  const data = query.data as
    | {
        session: {
          id: string;
          code: string;
          title: string;
          status: SessionStatus;
          stageQuestionId: string | null;
          pulse: Pulse | null;
        };
        questions: BoardQuestion[];
      }
    | undefined;
  const session = data?.session;
  const questions = data?.questions ?? [];
  const onStage = questions.find((q) => q.id === session?.stageQuestionId) ?? null;
  const upNext = questions
    .filter((q) => q.status === "queued" && q.id !== session?.stageQuestionId)
    .sort(upNextOrder);
  const top = questions
    .filter((q) => q.status === "new" || q.status === "queued")
    .sort((a, b) => b.totalVotes - a.totalVotes)
    .slice(0, 4);

  useEffect(() => {
    const reveal = () => {
      setShowHint(true);
      window.clearTimeout(hintTimer.current);
      hintTimer.current = window.setTimeout(() => setShowHint(false), 3000);
    };
    reveal();
    window.addEventListener("mousemove", reveal);
    return () => {
      window.removeEventListener("mousemove", reveal);
      window.clearTimeout(hintTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "ArrowRight" || event.key === "n" || event.key === " ") {
        event.preventDefault();
        const next = upNext[0] ?? top.find((q) => q.id !== session.stageQuestionId);
        if (next) setStage.mutate({ sessionId: session.id, questionId: next.id });
      } else if (event.key === "Escape") {
        if (session.stageQuestionId) setStage.mutate({ sessionId: session.id, questionId: null });
      } else if (event.key === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, upNext, top, setStage]);

  const link = session ? joinUrl(session.code) : "";
  const host = displayUrl(link).replace(/\/j\/[^/]+$/, "");

  return (
    <div className="dark fixed inset-0 flex flex-col overflow-hidden bg-[hsl(var(--floor-stage))] px-[5vw] py-[4.5vh] text-[hsl(var(--floor-stage-foreground))]">
      {!session ? (
        query.isPending ? null : (
          <p className="m-auto text-xl opacity-60">{t("floor.sessionNotFound")}</p>
        )
      ) : (
        <>
          <header className="flex items-start justify-between gap-[4vw]">
            <div className="flex min-w-0 items-center gap-3 text-[clamp(14px,1.3vw,22px)]">
              <span className="floor-tally size-3!" data-state={session.status} />
              <span className="font-semibold uppercase tracking-[0.2em] text-[hsl(var(--floor-live))]">
                {t(session.status === "live" ? "floor.statusLive" : session.status === "paused" ? "floor.statusPaused" : "floor.statusEnded")}
              </span>
              <span className="truncate opacity-70">{session.title}</span>
            </div>
            <div className="flex shrink-0 items-center gap-[1.5vw]">
              <div className="text-right leading-tight">
                <p className="text-[clamp(12px,1vw,18px)] uppercase tracking-[0.18em] opacity-60">
                  {t("floor.stageAskAt")}
                </p>
                <p className="text-[clamp(13px,1.2vw,20px)] opacity-80">{host}/j/</p>
                <p className="font-mono text-[clamp(28px,3.6vw,64px)] font-bold tracking-[0.12em]">
                  {session.code}
                </p>
              </div>
              <QrCode value={link} label={t("floor.qrLabel")} className="size-[clamp(88px,9vw,170px)] p-[0.6vw]" />
            </div>
          </header>

          <main className="flex min-h-0 flex-1 flex-col justify-center py-[3vh]">
            {onStage ? (
              <div key={onStage.id} className="floor-stage-question max-w-[82vw]">
                <p className="text-[clamp(13px,1.3vw,22px)] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--floor-live))]">
                  {t("floor.nowAnswering")}
                </p>
                <h1 className="mt-[2.5vh] text-[clamp(30px,4.8vw,92px)] font-semibold leading-[1.08] tracking-tight [overflow-wrap:anywhere]">
                  {onStage.body}
                </h1>
                <p className="mt-[3vh] flex flex-wrap items-center gap-x-4 gap-y-1 text-[clamp(14px,1.5vw,26px)] opacity-70">
                  <span>{onStage.authorName ?? t("floor.anonymous")}</span>
                  <span className="inline-flex items-center gap-1 text-[hsl(var(--floor-heat))]">
                    <IconArrowBigUpFilled className="size-[1em]" />
                    {onStage.totalVotes}
                  </span>
                  {onStage.duplicates.length ? (
                    <span>{t("floor.peopleAsked", { count: onStage.duplicates.length + 1 })}</span>
                  ) : null}
                </p>
              </div>
            ) : top.length ? (
              <div className="max-w-[82vw]">
                <p className="text-[clamp(13px,1.3vw,22px)] font-semibold uppercase tracking-[0.22em] opacity-60">
                  {t("floor.topQuestions")}
                </p>
                <ol className="mt-[3vh] space-y-[2.2vh]">
                  {top.map((q) => (
                    <li key={q.id} className="floor-card flex items-baseline gap-[1.5vw]">
                      <span className="inline-flex w-[4.5vw] shrink-0 items-center justify-end gap-1 font-semibold tabular-nums text-[hsl(var(--floor-heat))] text-[clamp(16px,1.8vw,32px)]">
                        <IconArrowBigUpFilled className="size-[0.8em]" />
                        {q.totalVotes}
                      </span>
                      <span className="text-[clamp(20px,2.6vw,48px)] font-medium leading-tight [overflow-wrap:anywhere]">
                        {q.body}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="max-w-[70vw]">
                <h1 className="text-[clamp(36px,6vw,110px)] font-semibold leading-none tracking-tight">
                  {t("floor.stageWelcome")}
                </h1>
                <p className="mt-[3vh] text-[clamp(16px,1.8vw,30px)] opacity-60">{t("floor.stageWelcomeBody")}</p>
              </div>
            )}
          </main>

          <footer className="grid grid-cols-1 gap-[3vw] border-t border-white/10 pt-[2.5vh] text-[clamp(12px,1.05vw,19px)] md:grid-cols-2">
            <div className="min-w-0">
              <p className="mb-2 uppercase tracking-[0.18em] opacity-50">{t("floor.colUpNext")}</p>
              {upNext.length ? (
                <ol className="space-y-1.5">
                  {upNext.slice(0, 3).map((q, index) => (
                    <li key={q.id} className="flex gap-3 opacity-85">
                      <span className="tabular-nums opacity-50">{index + 1}</span>
                      <span className="truncate">{q.body}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="opacity-40">—</p>
              )}
            </div>
            <div className="min-w-0">
              <p className="mb-2 uppercase tracking-[0.18em] opacity-50">{t("floor.roomPulse")}</p>
              {session.pulse ? (
                <>
                  <p className="line-clamp-2 opacity-85">{session.pulse.summary}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {session.pulse.themes.slice(0, 6).map((theme) => (
                      <span key={theme.name} className="rounded-full border border-white/15 px-2.5 py-0.5 opacity-80">
                        {theme.name} <span className="tabular-nums opacity-60">{theme.count}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="opacity-40">{t("floor.questionCount", { count: questions.length })}</p>
              )}
            </div>
          </footer>

          <p
            className="pointer-events-none fixed bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs opacity-0 transition-opacity duration-500 data-[show=true]:opacity-70"
            data-show={showHint ? "true" : "false"}
          >
            {t("floor.stageKeys")}
          </p>
        </>
      )}
    </div>
  );
}
