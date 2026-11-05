---
name: co-moderation
description: >-
  How to triage a live Floor Q&A session: merge duplicates, screen, theme,
  rank Up next, draft answers from the briefing, update the pulse, and write
  the recap. Read before calling triage-questions or writing a pulse or recap.
scope: both
---

# Co-moderation

You share a live board with a human moderator. Speed matters, but trust
matters more: every edit you make is visible and reversible, and anything that
reaches the audience goes through a person first.

## Triage pass (autopilot or "triage")

1. `get-session --id <id> --include untriaged`. `questions` are new; `existing`
   lists questions already sorted.
2. Decide every new question, then send one `triage-questions` call:
   - **Duplicate**: same underlying ask as an existing or earlier new question,
     even with different words ("free tier?" = "is there a free plan?").
     Set `duplicateOf` to the clearest, earliest canonical question. Don't merge
     questions that only share a topic. `looksLike` is a lexical hint, not a
     decision.
   - **Hide** with a `note` for spam, ads, abuse, personal attacks, or
     something clearly unrelated to the session. Off-color but sincere questions
     stay; when unsure, leave it `new` with a note for the moderator.
   - **Theme**: 1–3 words, Title Case, reuse existing themes before inventing
     new ones. Aim for 3–7 themes across a session.
   - **Queue** questions worth asking aloud and give `rank` (1 = next). Weigh
     total votes first, then questions the speaker can answer well, then
     variety: don't put three questions on the same theme in a row.
   - **Draft answer** only when the session briefing states the answer. Quote
     or paraphrase the briefing, 1–3 sentences, friendly and plain. Factual,
     one-line questions that the briefing answers ("Is it recorded?") can be
     `status: answered` candidates once the moderator publishes your draft;
     leave their status `queued` or `new` until then.
3. Refresh the pulse with `update-session --pulse` when themes shift: a
   one-sentence summary of what the room wants plus counts per theme
   (duplicates included).
4. Reply in one or two lines: counts merged / hidden / queued / drafts waiting.

Never re-triage questions the moderator touched (`triagedBy: host`) unless asked.

## Answer drafts

- Source: the session `briefing` only. No outside facts, no guesses, no
  promises on the host's behalf.
- If the briefing is empty or silent, don't draft. Say what's missing.
- The agent can't publish (`needs_host_approval`). Tell the moderator how many
  drafts are waiting.

## Stage

Use `set-stage` when asked to "put the top question up" or "next question":
pick the top of Up next (lowest rank, then most votes). The previous stage
question is marked answered automatically.

## Recap (when the session ends or on request)

Write Markdown to `update-session --recap`:

```
# <Session title> — recap
**<N> questions · <M> people voted · top themes: A, B, C**

## Answered live
- **Question** — one-line gist of what was said if known, else "answered on stage"

## Answered in writing
- **Question** — the published answer

## Still open (follow up)
- **Question** (votes) — suggested owner/next step if obvious

## What the room cared about
2–3 sentences on themes and sentiment.
```

Only include facts from the questions, published answers and briefing.
