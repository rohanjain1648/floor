import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake transaction: reads return `rows`, updates are recorded.
let rows: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
const tx = {
  select: () => ({
    from: () => ({ where: () => ({ for: async () => rows.map((r) => ({ ...r })) }) }),
  }),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        updates.push(values);
      },
    }),
  }),
};

vi.mock("../db/index.js", () => ({
  getDb: () => ({ transaction: (fn: (t: typeof tx) => unknown) => fn(tx) }),
  schema: { floorQuestions: { sessionId: "session_id", id: "id" } },
}));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));
vi.mock("./floor.js", () => ({ notifySession: vi.fn() }));

const { applyQuestionPatches } = await import("./question-patch.js");
type Session = Parameters<typeof applyQuestionPatches>[0];
const session = { id: "s1" } as Session;

function question(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    sessionId: "s1",
    body: `question ${id}`,
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
    ...extra,
  };
}

beforeEach(() => {
  rows = [];
  updates.length = 0;
});

describe("applyQuestionPatches", () => {
  it("saves agent answers as drafts even when the agent asks to publish later", async () => {
    rows = [question("a")];
    const [saved] = await applyQuestionPatches(session, [{ id: "a", answer: "From the briefing." }], "agent");
    expect(saved).toMatchObject({ answerState: "draft", answerBy: "agent", triagedBy: "agent" });

    rows = [question("a", { answer: "From the briefing.", answerState: "draft", answerBy: "agent" })];
    await expect(
      applyQuestionPatches(session, [{ id: "a", answerState: "published" }], "agent"),
    ).rejects.toMatchObject({ errorCode: "needs_host_approval" });
  });

  it("lets a person approve the agent's draft without taking credit for it", async () => {
    rows = [question("a", { answer: "From the briefing.", answerState: "draft", answerBy: "agent" })];
    const [saved] = await applyQuestionPatches(session, [{ id: "a", answerState: "published" }], "host");
    expect(saved).toMatchObject({ answerState: "published", answerBy: "agent", status: "answered" });
    expect(saved?.answeredAt).toBeTruthy();
  });

  it("credits the host once they rewrite the answer", async () => {
    rows = [question("a", { answer: "Draft.", answerState: "draft", answerBy: "agent" })];
    const [saved] = await applyQuestionPatches(session, [{ id: "a", answer: "Rewritten by me." }], "host");
    expect(saved).toMatchObject({ answerBy: "host", answerState: "draft" });
  });

  it("merges into the canonical question and re-points existing duplicates", async () => {
    rows = [question("root"), question("mid", { duplicateOf: "root" }), question("x"), question("child", { duplicateOf: "x" })];
    // Merging x into mid must land on root (mid is itself a duplicate) and carry x's child along.
    const changed = await applyQuestionPatches(session, [{ id: "x", duplicateOf: "mid" }], "agent");
    const byId = Object.fromEntries(changed.map((q) => [q.id, q]));
    expect(byId.x?.duplicateOf).toBe("root");
    expect(byId.child?.duplicateOf).toBe("root");
  });

  it("rejects ids from another session without writing anything", async () => {
    rows = [question("a")];
    await expect(
      applyQuestionPatches(session, [{ id: "a", status: "queued" }, { id: "ghost", status: "hidden" }], "agent"),
    ).rejects.toMatchObject({ errorCode: "not_found" });
    expect(updates).toHaveLength(0);
  });
});
