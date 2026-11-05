import { useT } from "@agent-native/core/client/i18n";
import {
  IconArrowBackUp,
  IconArrowBigUpFilled,
  IconArrowUp,
  IconCheck,
  IconDots,
  IconEye,
  IconEyeOff,
  IconGitMerge,
  IconPencil,
  IconPresentation,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { agentFresh, timeAgo, type BoardQuestion } from "@/lib/floor";
import { cn } from "@/lib/utils";

import type { QuestionPatchInput } from "./use-board";

export type CardVariant = "inbox" | "upnext" | "answered" | "hidden";

interface QuestionCardProps {
  question: BoardQuestion;
  variant: CardVariant;
  position?: number;
  onStage?: boolean;
  selected?: boolean;
  mergeTargets: BoardQuestion[];
  onPatch: (input: QuestionPatchInput) => void;
  onStageChange: (questionId: string | null) => void;
  onSelect: (question: BoardQuestion) => void;
  onAskAgent: (question: BoardQuestion) => void;
}

function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
}

function closest(question: BoardQuestion, candidates: BoardQuestion[]) {
  const mine = words(question.body);
  return candidates
    .filter((c) => c.id !== question.id && c.status !== "hidden")
    .map((c) => {
      let shared = 0;
      for (const w of words(c.body)) if (mine.has(w)) shared += 1;
      return { c, shared };
    })
    .sort((a, b) => b.shared - a.shared || b.c.totalVotes - a.c.totalVotes)
    .slice(0, 8)
    .map(({ c }) => c);
}

export function AgentMark({ label }: { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="floor-agent-mark inline-flex items-center gap-0.5 font-medium"
          aria-label={label}
        >
          <IconSparkles className="size-3" strokeWidth={2} />
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function QuestionCard({
  question: q,
  variant,
  position,
  onStage,
  selected,
  mergeTargets,
  onPatch,
  onStageChange,
  onSelect,
  onAskAgent,
}: QuestionCardProps) {
  const t = useT();
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(q.answer ?? "");
  const agentTouched = q.triagedBy === "agent";

  function startEditing() {
    setDraft(q.answer ?? "");
    setEditing(true);
  }

  function saveAnswer(publish: boolean) {
    const text = draft.trim();
    if (!text) return;
    onPatch({
      id: q.id,
      answer: text,
      ...(publish ? { answerState: "published" as const } : {}),
    });
    setEditing(false);
  }

  const mergeMenu = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <IconGitMerge className="size-4" />
        {t("floor.mergeInto")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-w-80">
        {closest(q, mergeTargets).map((target) => (
          <DropdownMenuItem
            key={target.id}
            onSelect={() => onPatch({ id: q.id, duplicateOf: target.id })}
          >
            <span className="line-clamp-2 text-xs">{target.body}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );

  return (
    <article
      data-agent-touched={agentTouched ? "true" : undefined}
      data-agent-fresh={agentFresh(q) ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(q)}
      className={cn(
        "floor-card group relative cursor-default rounded-xl border border-border bg-card p-3 transition-colors",
        selected && "border-foreground/40",
        onStage && "border-[hsl(var(--floor-live))] ring-1 ring-[hsl(var(--floor-live)/0.35)]",
        variant === "hidden" && "opacity-70",
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "flex w-9 shrink-0 flex-col items-center self-start rounded-lg py-1 text-xs font-semibold tabular-nums",
            q.totalVotes > 0
              ? "bg-[hsl(var(--floor-heat)/0.12)] text-[hsl(var(--floor-heat))]"
              : "bg-muted text-muted-foreground",
          )}
          aria-label={t("floor.votesLabel", { count: q.totalVotes })}
        >
          <IconArrowBigUpFilled className="size-3.5" />
          {q.totalVotes}
        </div>

        <div className="min-w-0 flex-1">
          {onStage ? (
            <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--floor-live))]">
              <span className="floor-tally" data-state="live" />
              {t("floor.onStage")}
            </p>
          ) : position ? (
            <p className="mb-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
              #{position}
            </p>
          ) : null}
          <p className="text-sm leading-snug text-foreground [overflow-wrap:anywhere]">
            {q.body}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="max-w-32 truncate">
              {q.authorName ?? t("floor.anonymous")}
            </span>
            <span aria-hidden>·</span>
            <time dateTime={q.createdAt}>{timeAgo(q.createdAt)}</time>
            {q.theme ? (
              <span className="rounded-full border border-border px-1.5 py-px text-[11px] text-foreground/80">
                {q.theme}
              </span>
            ) : null}
            {q.duplicates.length ? (
              <button
                type="button"
                className="font-medium text-foreground/80 underline-offset-2 hover:underline"
                onClick={(event) => {
                  event.stopPropagation();
                  setShowDuplicates((open) => !open);
                }}
              >
                {t("floor.alsoAsked", { count: q.duplicates.length })}
              </button>
            ) : null}
            {agentTouched ? <AgentMark label={t("floor.sortedByAgent")} /> : null}
          </div>

          {q.note ? (
            <p
              className={cn(
                "mt-1.5 text-xs",
                agentTouched ? "floor-agent-mark" : "text-muted-foreground",
              )}
            >
              {q.note}
            </p>
          ) : null}

          {q.looksLike && variant === "inbox" ? (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted/60 px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t("floor.looksLike")} “{q.looksLike.body}”
              </span>
              <Button
                size="xs"
                variant="outline"
                onClick={(event) => {
                  event.stopPropagation();
                  onPatch({ id: q.id, duplicateOf: q.looksLike!.id });
                }}
              >
                {t("floor.merge")}
              </Button>
            </div>
          ) : null}

          {showDuplicates ? (
            <ul className="mt-2 space-y-1 border-s-2 border-border ps-2">
              {q.duplicates.map((d) => (
                <li key={d.id} className="flex items-start gap-2 text-xs">
                  <span className="min-w-0 flex-1 text-muted-foreground [overflow-wrap:anywhere]">
                    {d.body}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPatch({ id: d.id, duplicateOf: null });
                    }}
                  >
                    {t("floor.split")}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {editing ? (
            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
              <Textarea
                autoFocus
                value={draft}
                maxLength={1500}
                rows={3}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("floor.answerPlaceholder")}
                aria-label={t("floor.answerPlaceholder")}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!draft.trim()} onClick={() => saveAnswer(true)}>
                  {t("floor.publishAnswer")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draft.trim()}
                  onClick={() => saveAnswer(false)}
                >
                  {t("floor.saveDraft")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  {t("floor.cancel")}
                </Button>
              </div>
            </div>
          ) : q.answer && q.answerState !== "none" ? (
            <div
              className={cn(
                "mt-2 rounded-lg border p-2.5 text-sm",
                q.answerState === "draft"
                  ? "border-dashed border-[hsl(var(--floor-agent)/0.5)] bg-[hsl(var(--floor-agent-soft))]"
                  : "border-[hsl(var(--floor-ok)/0.35)] bg-[hsl(var(--floor-ok)/0.06)]",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <p
                className={cn(
                  "mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider",
                  q.answerState === "draft"
                    ? "floor-agent-mark"
                    : "text-[hsl(var(--floor-ok))]",
                )}
              >
                {q.answerState === "draft" ? (
                  <>
                    {q.answerBy === "agent" ? <IconSparkles className="size-3" /> : null}
                    {q.answerBy === "agent" ? t("floor.agentDraft") : t("floor.yourDraft")}
                  </>
                ) : (
                  <>
                    <IconCheck className="size-3" />
                    {t("floor.publishedAnswer")}
                  </>
                )}
              </p>
              <p className="whitespace-pre-wrap leading-snug [overflow-wrap:anywhere]">
                {q.answer}
              </p>
              {q.answerState === "draft" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    onClick={() => onPatch({ id: q.id, answerState: "published" })}
                  >
                    <IconCheck className="size-3.5" />
                    {t("floor.approve")}
                  </Button>
                  <Button size="xs" variant="outline" onClick={startEditing}>
                    <IconPencil className="size-3.5" />
                    {t("floor.edit")}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => onPatch({ id: q.id, answerState: "none" })}
                  >
                    {t("floor.discard")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {!editing ? (
        <div
          className="mt-2.5 flex flex-wrap items-center gap-1.5 ps-12"
          onClick={(e) => e.stopPropagation()}
        >
          {variant === "inbox" ? (
            <>
              <Button size="xs" variant="outline" onClick={() => onPatch({ id: q.id, status: "queued" })}>
                <IconArrowUp className="size-3.5" />
                {t("floor.queue")}
              </Button>
              <Button size="xs" variant="ghost" onClick={startEditing}>
                <IconPencil className="size-3.5" />
                {t("floor.answer")}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => onPatch({ id: q.id, status: "hidden" })}>
                <IconEyeOff className="size-3.5" />
                {t("floor.hide")}
              </Button>
            </>
          ) : null}
          {variant === "upnext" ? (
            onStage ? (
              <Button size="xs" onClick={() => onStageChange(null)}>
                <IconCheck className="size-3.5" />
                {t("floor.doneOnStage")}
              </Button>
            ) : (
              <>
                <Button size="xs" variant="outline" onClick={() => onStageChange(q.id)}>
                  <IconPresentation className="size-3.5" />
                  {t("floor.putOnStage")}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => onPatch({ id: q.id, status: "answered" })}>
                  <IconCheck className="size-3.5" />
                  {t("floor.markAnswered")}
                </Button>
              </>
            )
          ) : null}
          {variant === "answered" ? (
            <Button size="xs" variant="ghost" onClick={() => onPatch({ id: q.id, status: "queued" })}>
              <IconArrowBackUp className="size-3.5" />
              {t("floor.reopen")}
            </Button>
          ) : null}
          {variant === "hidden" ? (
            <Button size="xs" variant="outline" onClick={() => onPatch({ id: q.id, status: "new", note: null })}>
              <IconEye className="size-3.5" />
              {t("floor.restore")}
            </Button>
          ) : null}

          {variant !== "hidden" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-xs" variant="ghost" aria-label={t("floor.moreActions")}>
                  <IconDots className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onSelect={() => onAskAgent(q)}>
                  <IconSparkles className="size-4 floor-agent-mark" />
                  {t("floor.askAgentDraft")}
                </DropdownMenuItem>
                {variant !== "upnext" ? (
                  <DropdownMenuItem onSelect={() => onStageChange(q.id)}>
                    <IconPresentation className="size-4" />
                    {t("floor.putOnStage")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={startEditing}>
                    <IconPencil className="size-4" />
                    {t("floor.answerInWriting")}
                  </DropdownMenuItem>
                )}
                {mergeMenu}
                {variant === "upnext" ? (
                  <DropdownMenuItem onSelect={() => onPatch({ id: q.id, status: "new", rank: null })}>
                    <IconArrowBackUp className="size-4" />
                    {t("floor.backToInbox")}
                  </DropdownMenuItem>
                ) : null}
                {q.answerState === "published" ? (
                  <DropdownMenuItem onSelect={() => onPatch({ id: q.id, answerState: "draft" })}>
                    <IconArrowBackUp className="size-4" />
                    {t("floor.unpublish")}
                  </DropdownMenuItem>
                ) : null}
                {variant !== "inbox" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => onPatch({ id: q.id, status: "hidden" })}>
                      <IconTrash className="size-4" />
                      {t("floor.hide")}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
