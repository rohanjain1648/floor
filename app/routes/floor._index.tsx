import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useT } from "@agent-native/core/client/i18n";
import { IconArrowRight, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/floor";

export function meta() {
  return [{ title: "Sessions · Floor" }];
}

export default function SessionsRoute() {
  const t = useT();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const { data, isPending } = useActionQuery("list-sessions", {});
  const create = useActionMutation("create-session", {
    onSuccess: (session) => navigate(`/floor/${session.id}?tab=briefing`),
    onError: (error) => toast.error(actionErrorMessage(error) ?? t("floor.createFailed")),
  });
  const sessions = data?.sessions ?? [];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (value) create.mutate({ title: value });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <section className="space-y-4">
        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t("floor.heroTitle")}
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          <IconSparkles className="floor-agent-mark me-1 inline size-4 align-[-2px]" />
          {t("floor.heroBody")}
        </p>
        <form onSubmit={submit} className="flex max-w-xl gap-2">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t("floor.titlePlaceholder")}
            aria-label={t("floor.titlePlaceholder")}
            maxLength={120}
          />
          <Button type="submit" disabled={!title.trim() || create.isPending}>
            {create.isPending ? t("floor.opening") : t("floor.openFloor")}
          </Button>
        </form>
      </section>

      <section className="space-y-2">
        {isPending ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)
        ) : sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {t("floor.noSessions")}
          </p>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              to={`/floor/${session.id}`}
              className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30"
            >
              <span className="floor-tally shrink-0" data-state={session.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{session.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  <span className="font-mono tracking-wider">{session.code}</span>
                  {" · "}
                  {t("floor.questionCount", { count: session.questionCount })}
                  {session.untriagedCount ? (
                    <>
                      {" · "}
                      <span className="text-foreground">
                        {t("floor.newCount", { count: session.untriagedCount })}
                      </span>
                    </>
                  ) : null}
                  {" · "}
                  {timeAgo(session.createdAt)}
                </span>
              </span>
              <IconArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
