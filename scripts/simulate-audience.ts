/**
 * Simulates a live audience for demos and load checks. Every question and vote
 * goes through the same public endpoints phones use (/api/public/floor/...).
 *
 *   pnpm simulate <CODE> [--base http://localhost:8080] [--fast] [--voters 40]
 *
 * The question set mixes near-duplicates, an ad and an off-topic message on
 * purpose so the agent has real triage work to do.
 */

const QUESTIONS: [name: string | null, body: string][] = [
  ["Priya", "Can I deploy an Agent-Native app to Cloudflare Workers?"],
  ["Marco", "Is the session being recorded?"],
  [null, "Does Agent-Native work with Postgres in production or only PGlite?"],
  ["Sam", "Will the recording be shared afterwards?"],
  ["Lena", "How do actions differ from regular API routes?"],
  ["Diego", "Can I deploy to Cloudflare?"],
  [null, "What LLM providers are supported besides Anthropic?"],
  ["Ava", "Can the agent see what I'm looking at in the UI?"],
  ["Tom", "Is there a free tier for hosting?"],
  ["Kenji", "How does live sync work when two people edit at once?"],
  [null, "BUY CHEAP FOLLOWERS at followz dot biz!!!"],
  ["Noor", "Do I need to register to submit to the hackathon?"],
  ["Felix", "Can I use OpenAI models instead of Claude?"],
  ["Rosa", "How does the agent know which screen I'm on?"],
  [null, "Is the hackathon deadline Nov 9 Pacific time?"],
  ["Ishaan", "Are recordings going to be posted?"],
  ["Mia", "What's the difference between an action and a skill?"],
  ["Jon", "anyone know a good pizza place near the venue lol"],
  ["Chloe", "Can I run the whole thing locally with Ollama?"],
  ["Omar", "How do I make a page public without login?"],
  [null, "Does it support MCP so Claude Desktop can call my actions?"],
  ["Hana", "Can I deploy on Workers or does it need Node?"],
  ["Luis", "What do judges weigh most heavily?"],
  ["Zoe", "Can automations trigger on my own custom events?"],
  [null, "Is Postgres required when deploying?"],
  ["Aria", "Can multiple agents work together on one task?"],
  ["Ben", "Will there be another office hours before the deadline?"],
  ["Yuki", "How should I structure AGENTS.md so it doesn't get too long?"],
];

function arg(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const code = process.argv.slice(2).find((a) => !a.startsWith("--") && /^[A-Za-z0-9]{4,8}$/.test(a));
if (!code) {
  console.error("Usage: pnpm simulate <CODE> [--base http://localhost:8080] [--fast] [--voters 40]");
  process.exit(1);
}
const base = (arg("base", "http://localhost:8080") ?? "").replace(/\/$/, "");
const fast = process.argv.includes("--fast");
const voterCount = Number(arg("voters", "40"));
const api = `${base}/api/public/floor/${code.toUpperCase()}`;

const token = () => crypto.randomUUID().replace(/-/g, "");
const voters = Array.from({ length: voterCount }, token);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => (fast ? min / 4 : min) + Math.random() * ((fast ? max / 4 : max) - (fast ? min / 4 : min));

async function post(path: string, body: unknown) {
  const res = await fetch(`${api}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string };
  if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
  return json;
}

async function snapshot() {
  const res = await fetch(api);
  if (!res.ok) throw new Error(`Session ${code} not found at ${base}`);
  return (await res.json()) as { session: { title: string }; questions: { id: string; body: string; votes: number }[] };
}

const initial = await snapshot();
console.log(`Simulating ${QUESTIONS.length} questions and ${voterCount} voters in “${initial.session.title}”`);

for (const [name, body] of QUESTIONS) {
  try {
    await post("/questions", { body, authorName: name ?? undefined, token: token() });
    console.log(`  ? ${name ?? "Anonymous"}: ${body}`);
  } catch (error) {
    console.log(`  ! ${(error as Error).message}`);
  }
  // A few people upvote what's already on the list; popular topics get more.
  const { questions } = await snapshot();
  const votesThisRound = Math.floor(Math.random() * 6);
  for (let i = 0; i < votesThisRound && questions.length; i += 1) {
    const weighted = questions[Math.floor(Math.random() ** 1.7 * questions.length)];
    const voter = voters[Math.floor(Math.random() * voters.length)];
    if (weighted && voter) await post("/votes", { questionId: weighted.id, token: voter }).catch(() => {});
  }
  await sleep(jitter(1500, 4200));
}
console.log("Done. Keep the board open to watch the agent work.");
