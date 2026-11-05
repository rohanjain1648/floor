import { Fragment, type ReactNode } from "react";

/** Renders the small Markdown subset the recap uses (headings, bullets,
 * bold, paragraphs) as React nodes; no HTML from the model reaches the DOM. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

export function MiniMarkdown({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-2 list-disc space-y-1 ps-5">
        {list.map((item, index) => (
          <li key={index}>{inline(item)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1] ?? "");
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      const text = heading[2] ?? "";
      blocks.push(
        level === 1 ? (
          <h2 key={blocks.length} className="mb-2 mt-1 text-xl font-semibold tracking-tight text-foreground">
            {inline(text)}
          </h2>
        ) : (
          <h3 key={blocks.length} className="mb-1 mt-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {inline(text)}
          </h3>
        ),
      );
      continue;
    }
    blocks.push(
      <p key={blocks.length} className="my-2">
        {inline(line)}
      </p>,
    );
  }
  flush();
  return <div className="text-sm leading-relaxed text-foreground/90">{blocks}</div>;
}
