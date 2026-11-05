# Floor: hackathon submission kit

Deadline: **Monday Nov 9, 2026, 11:59 PM Pacific** (Tue Nov 10, 1:29 PM IST).
Form: https://www.builder.io/hackathon/submit. Recording a clip does **not**
submit an entry on its own; you have to send the form and confirm receipt.

## Form fields (ready to paste)

**Project name:** Floor

**Project description:**

> Floor is live audience Q&A where an AI agent co-moderates and a person stays
> in charge. The audience joins from their phones with a code (no login), asks
> questions and upvotes. As questions pour in, the agent merges duplicates so
> votes add up, hides spam with a stated reason, groups themes, ranks what to
> ask next, keeps a live "room pulse", and drafts answers using only the host's
> briefing. The moderator works a live board where every agent decision is
> marked and reversible, approves each answer before the audience sees it, and
> drives a projector-ready stage view. At the end, the agent writes a recap of
> what was answered and what's still open.
>
> One set of Agent-Native actions powers the board, the agent, autopilot,
> automations, the CLI, MCP and WebMCP. `ctx.caller` stamps agent decisions and
> enforces "the agent can't publish". Navigation and selection state give the
> agent context ("draft an answer for this"). Live sync covers anonymous
> audience writes and co-moderators. A custom `floor.question.submitted` event
> lets users build automations.
>
> Team: <your name(s)>. Built on the Agent-Native `chat` starter template
> (scaffolded Oct 31, 2026, first commit). All Floor features — data model,
> actions, public audience API, board/stage/audience UIs, agent prompt and
> co-moderation skill, simulator and tests — were built during the hackathon.
> Third-party: qrcode-generator (MIT).

**Project or GitHub URL:** push this folder to a public GitHub repo (optional but encouraged).

**Public Clips recording URL:** from https://clips.agent-native.com, set to public / viewable without login.

**Slides URL:** optional.

## Before you record

1. Connect the agent to a model: open the agent settings and add an Anthropic
   (or OpenAI) key, or connect Builder.io. Without this, autopilot and the agent
   buttons can't run.
2. `pnpm dev`, then open http://localhost:8080 and continue as local dev.
3. Create the session **"Agent-Native office hours"** and paste this briefing:
   ```
   - The session is recorded. The recording is emailed to everyone who registered within 24 hours.
   - Agent-Native runs on any Nitro-compatible host: Cloudflare, Netlify, Vercel, Node, Docker.
   - Production uses Postgres (Neon, Supabase, RDS). PGlite is for local development only.
   - Model providers: Anthropic, OpenAI, Google, Groq, Mistral, OpenRouter, and local Ollama.
   - Hackathon deadline: Nov 9, 11:59 PM Pacific. No registration is needed to submit.
   - More office hours: Nov 3 and Nov 5 at 8:30 AM PT.
   ```
4. For a real phone in the shot, set `VITE_FLOOR_JOIN_ORIGIN=http://<your-LAN-IP>:8080`
   in `.env` and restart. Otherwise use a narrow browser window on `/j/<code>`.
5. Keep a terminal ready with `pnpm simulate <CODE>`.

## Demo script (about 3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Empty board with QR | "Every Q&A hits the same wall: 40 questions, half of them duplicates, some spam, and a moderator scrolling instead of listening. Floor gives the moderator an agent co-host." |
| 0:15 | Briefing tab | "I give it my notes. That's the only source it may answer from." |
| 0:25 | Phone: ask a question; board updates live | "The audience joins with a code, no login. Questions land on the board instantly." |
| 0:40 | Run `pnpm simulate`; board fills | "Here comes a room's worth of questions." |
| 0:55 | Flip **Autopilot**; agent sidebar optional | "Autopilot hands each burst to the agent." |
| 1:05 | Duplicates collapse ("+2 asked this too"), spam hidden with a reason, themes and pulse appear, Up next ranked | "It merges duplicates so votes add up, hides spam and says why, groups themes, and ranks what to ask next. Everything it touched is marked." |
| 1:35 | Split a merge, restore a hidden question | "I can undo any of it in one click. Same actions, same data." |
| 1:50 | Approve a draft; phone shows "drafted by the host's assistant · approved by the host" | "It drafts answers from my notes, but nothing reaches the audience until I approve it." |
| 2:05 | In chat: "publish all the drafts" → agent explains it can't | "That rule is enforced in the action itself, for every caller." |
| 2:15 | Put on stage → stage view; press → | "One click puts a question on the projector; the arrow key moves to the next." |
| 2:30 | Click a question, ask in chat "draft an answer for this" | "It knows what I'm looking at." |
| 2:40 | Ask "when someone asks about pricing, message me" | "Each question is an event, so automations need no code." |
| 2:50 | Recap tab → Write recap | "At the end, a recap of what we answered and what's still open. That's Floor." |

## Checklist

- [ ] LLM connected and autopilot verified on a fresh session
- [ ] Clips recording is public and opens in a private/incognito window
- [ ] (Optional) repo pushed public; README screenshots render
- [ ] Form submitted before Nov 9, 11:59 PM PT, and the confirmation received
