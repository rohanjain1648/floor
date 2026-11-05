# Floor

**Live audience Q&A where an AI agent co-moderates — and a person stays in charge.**

The audience asks and upvotes from their phones. While questions pour in, the
agent merges duplicates, screens out noise, groups themes, ranks what to ask
next and drafts answers from the host's notes. The moderator sees every agent
decision on a live board, can change any of it, and approves each answer before
the room sees it. A stage view drives the projector.

Built with [Agent-Native](https://agent-native.com) for the Builder.io
Agent-Native Hackathon.

![Moderator board after an agent triage pass](docs/screenshots/04-board-triaged.png)

| Stage (projector) | Audience (phone) |
| --- | --- |
| ![Stage view](docs/screenshots/06-stage.png) | ![Audience view](docs/screenshots/07-phone-answered.png) |

## The problem

Every all-hands, webinar, conference talk and office hour hits the same wall:
40 questions arrive, 15 of them are the same three questions in different words,
a few are spam, the moderator is scrolling instead of listening, and the best
questions are buried. Afterwards nobody knows what went unanswered.

## How people and the agent work together

| | The audience | The agent | The moderator |
| --- | --- | --- | --- |
| **Ask** | Ask and upvote at `/j/<code>`; no account | — | Add questions from the room mic |
| **Sort** | See merged questions' combined votes | Merges duplicates so votes add up; hides spam/off-topic **with a reason**; tags themes | Every agent change is marked ✦, and one click undoes, splits or restores it |
| **Prioritize** | Vote | Ranks *Up next* by votes, answerability and theme variety | Re-orders, queues, puts a question on stage |
| **Answer** | Gets written answers on their phone | Drafts answers **only from the host's briefing** | **Approves**, edits or discards each draft — the agent cannot publish |
| **Read the room** | Sees the room pulse | Keeps a live pulse: one-line summary + theme counts | Filters the board by theme |
| **Wrap up** | — | Writes the recap: answered, still open, what the room cared about | Copies the Markdown recap |

**Autopilot.** Flip it on and the board hands each burst of new questions to the
agent in the background; the board sorts itself while the moderator listens.

**The trust contract.** Anything the audience sees from the agent passes a
person first. That rule lives in the shared action layer, so it holds for every
caller — chat, autopilot, automations, MCP and browser agents — and it is covered
by tests (`server/lib/question-patch.spec.ts`). The audience can see when an
answer was "drafted by the host's assistant · approved by the host".

## How it uses Agent-Native

| Framework piece | In Floor |
| --- | --- |
| **Shared actions** | 8 domain actions (`actions/`) are the single contract for the board UI, the agent, the CLI, HTTP, MCP and WebMCP. The board's buttons and the agent call the same `triage-questions`, `update-question` and `set-stage` code. |
| **Caller-aware actions** | `ctx.caller` tells agent calls (`tool`, `automation`, `mcp`, `webmcp`, `a2a`) apart from people (`frontend`, `cli`), so agent decisions are stamped ✦ and agent answers are forced to drafts. |
| **Context awareness** | Navigation state carries `sessionId` and the active tab. Clicking a question writes `selection`, so "draft an answer for this" just works. `view-screen` returns the open session, live stats, the stage question and the selected question. |
| **`sendToAgentChat`** | "Triage N new", "Ask agent to draft an answer", "Write recap", and autopilot (with `background: true`, so the sidebar stays closed). |
| **Live sync** | The board and stage opt into `useDbSync({ realtime })`. Anonymous audience writes come through public routes that call `recordChange` with the session as the resource, and mutating actions declare `changeResource`, so co-moderators in the same org see each other's changes live. |
| **Event bus + automations** | Every audience question emits `floor.question.submitted`, so users can ask the agent for automations like "when someone asks about pricing, ping me in Slack" without code changes. |
| **Skills + AGENTS.md** | `.agents/skills/co-moderation/SKILL.md` is the agent's triage playbook: duplicate rules, screening, ranking, answer sourcing and the recap format. |
| **Sharing** | Sessions are a registered shareable resource (`ownableColumns`, org-visible), and questions inherit the session's access. |
| **Public paths** | `/j/*` and `/api/public/*` are open to anonymous audiences; everything else stays behind auth. |
| **Invariants in SQL** | One vote per person per question (composite primary key + transaction), canonical-only duplicates, rate limits per device, `CHECK` constraints. |

```
 phones ──/api/public──▶ insertQuestion / toggleVote ──▶ Postgres ◀── actions ◀── board UI (React)
                              │ recordChange + emit            ▲            ◀── agent (chat, autopilot,
                              ▼                                │                automations, MCP, WebMCP)
                     live sync → board/stage      view-screen ◀┘ navigation + selection
```

## Run it

Requirements: Node.js ≥ 22.22, pnpm (`corepack enable`), and an LLM connection
for the agent (Anthropic/OpenAI key, Builder.io, or local Ollama, set in the
app's agent settings).

```bash
pnpm install
pnpm dev                  # http://localhost:8080 → "Continue as local dev"
```

1. Open **Sessions**, name a session and open the floor. Paste your notes into **Briefing**.
2. Join from a phone with the QR code (see *Phones on your network* below), or simulate a room:
   ```bash
   pnpm simulate <CODE>          # ~30 realistic questions + votes via the public API
   pnpm simulate <CODE> --fast   # 4× faster
   ```
3. Turn on **Autopilot**, or press **Triage N new**, and watch the board sort itself.
4. Approve drafts, then use **Stage** to open the projector view (→ next, Esc clear, F fullscreen).
5. Open **Recap** → **Write recap** when you're done.

**Phones on your network.** Local dev sign-in only works on `localhost`, so the
moderator stays on localhost. Point the join link and QR at your LAN or tunnel
address with `VITE_FLOOR_JOIN_ORIGIN` in `.env` (see `.env.example`).

**Things to ask the agent:**
- "Triage the new questions and tell me what you hid."
- "Draft answers for anything the briefing covers."
- "Put the top question on stage."
- "What is the room most worried about?"
- "When someone asks about pricing in this session, message me."

## Checks

```bash
pnpm test                   # domain + invariant tests (agent can't publish, merges, audience privacy)
pnpm typecheck
pnpm agent-native:doctor
```

## Built on

Scaffolded with `npx @agent-native/core create floor --template chat` (the
untouched template is the first commit, `0ec0864`). The framework, chat shell,
auth and agent sidebar come from that template. Everything Floor-specific was
written during the hackathon:

- data model, migrations and sharing registration (`server/db`, `server/plugins/db.ts`)
- domain logic, rules and the public audience API (`server/lib`, `server/routes/api/public`)
- the 8 Floor actions and the extended `view-screen` (`actions/`)
- the event registration (`server/plugins/floor-events.ts`)
- the board, stage and audience UIs (`app/routes/floor*`, `stage.*`, `j.*`, `app/components/floor`)
- the agent prompt, `AGENTS.md` section and co-moderation skill
- the audience simulator, tests and screenshots

Third-party additions: `qrcode-generator` (MIT).
