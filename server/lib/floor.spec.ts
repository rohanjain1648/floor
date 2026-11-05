import { describe, expect, it, vi } from "vitest";

vi.mock("../db/index.js", () => ({ getDb: vi.fn(), schema: {} }));
vi.mock("@agent-native/core/server/poll", () => ({ recordChange: vi.fn() }));
vi.mock("@agent-native/core/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@agent-native/core/sharing", () => ({ accessFilter: vi.fn() }));

const { actorFor, boardQuestions, publicSnapshot, similarity } = await import(
  "./floor.js"
);
type Row = Parameters<typeof boardQuestions>[0][number];
type Session = Parameters<typeof publicSnapshot>[0];

let clock = 0;
function row(overrides: Partial<Row>): Row {
  clock += 1;
  return {
    id: `q${clock}`,
    sessionId: "s1",
    body: "A question",
    authorName: null,
    authorToken: `token-${clock}`,
    votes: 0,
    status: "new",
    duplicateOf: null,
    theme: null,
    rank: null,
    note: null,
    answer: null,
    answerState: "none",
    answerBy: null,
    triagedBy: null,
    triagedAt: null,
    answeredAt: null,
    createdAt: new Date(Date.UTC(2026, 10, 1, 10, 0, clock)).toISOString(),
    ownerEmail: "host@example.com",
    orgId: null,
    ...overrides,
  };
}

const session: Session = {
  id: "s1",
  code: "ABC234",
  title: "Office hours",
  briefing: "secret host notes",
  status: "live",
  stageQuestionId: null,
  autopilot: 0,
  pulse: null,
  recap: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  ownerEmail: "host@example.com",
  orgId: null,
  visibility: "private",
};

describe("similarity", () => {
  it("scores reworded duplicates above unrelated questions", () => {
    const dup = similarity(
      "Will the recording be shared afterwards?",
      "Are recordings going to be shared?",
    );
    const unrelated = similarity(
      "Will the recording be shared afterwards?",
      "Can I deploy to Cloudflare Workers?",
    );
    expect(dup).toBeGreaterThan(unrelated);
    expect(unrelated).toBe(0);
  });
});

describe("boardQuestions", () => {
  it("folds duplicates under their canonical question and rolls up votes", () => {
    const parent = row({ id: "p", body: "Can I deploy to Cloudflare?", votes: 3 });
    const child = row({ id: "c", body: "Cloudflare deploy?", votes: 2, duplicateOf: "p" });
    const other = row({ id: "o", body: "Is it recorded?", votes: 1 });
    const board = boardQuestions([parent, child, other]);
    expect(board.map((q) => q.id)).toEqual(["p", "o"]);
    expect(board[0]).toMatchObject({ totalVotes: 5, votes: 3 });
    expect(board[0]?.duplicates.map((d) => d.id)).toEqual(["c"]);
  });

  it("hints a likely duplicate only for untriaged new questions", () => {
    const first = row({ id: "a", body: "Can I deploy an app to Cloudflare Workers?" });
    const second = row({ id: "b", body: "Deploy app on Cloudflare Workers possible?" });
    const triaged = row({
      id: "t",
      body: "Deploy app to Cloudflare Workers?",
      triagedBy: "host",
    });
    const board = boardQuestions([first, second, triaged]);
    expect(board.find((q) => q.id === "b")?.looksLike?.id).toBe("a");
    expect(board.find((q) => q.id === "t")?.looksLike).toBeNull();
  });
});

describe("publicSnapshot", () => {
  it("never shows the audience hidden questions, drafts, notes, tokens or the briefing", () => {
    const visible = row({
      id: "v",
      body: "Is it recorded?",
      answer: "Draft only",
      answerState: "draft",
      note: "moderator-only note",
    });
    const hidden = row({ id: "h", body: "spam", status: "hidden", authorToken: "spammer" });
    const published = row({
      id: "p",
      body: "Slides?",
      answer: "Yes, after the talk.",
      answerState: "published",
      answerBy: "agent",
      status: "answered",
    });
    const snap = publicSnapshot(session, [visible, hidden, published], "someone", new Set());
    expect(snap.questions.map((q) => q.id)).toEqual(["v", "p"]);
    expect(snap.questions.find((q) => q.id === "v")?.answer).toBeNull();
    expect(snap.questions.find((q) => q.id === "p")).toMatchObject({
      answer: "Yes, after the talk.",
      answerBy: "agent",
    });
    const json = JSON.stringify(snap);
    expect(json).not.toContain("moderator-only note");
    expect(json).not.toContain("secret host notes");
    expect(json).not.toContain("token-");
    expect(json).not.toContain("Draft only");
  });

  it("shows people their own questions, including hidden and merged ones", () => {
    const parent = row({ id: "p", body: "Free tier?" });
    const mineMerged = row({ id: "m", body: "Is there a free plan?", duplicateOf: "p", authorToken: "me" });
    const mineHidden = row({ id: "x", body: "off topic", status: "hidden", authorToken: "me" });
    const snap = publicSnapshot(session, [parent, mineMerged, mineHidden], "me", new Set(["m"]));
    expect(snap.mine.map((q) => q.id)).toEqual(["m", "x"]);
    expect(snap.mine[0]?.mergedInto?.id).toBe("p");
    expect(snap.questions[0]?.voted).toBe(true);
  });
});

describe("actorFor", () => {
  it("treats agent loops and external agents as the agent, people as the host", () => {
    expect(actorFor("tool")).toBe("agent");
    expect(actorFor("automation")).toBe("agent");
    expect(actorFor("mcp")).toBe("agent");
    expect(actorFor("frontend")).toBe("host");
    expect(actorFor("cli")).toBe("host");
  });
});
