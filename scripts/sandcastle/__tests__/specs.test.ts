import { expect, test } from "bun:test";
import { createGitHubIssueTracker } from "../github";
import type { IssueTracker, TrackedIssue } from "../specs";
import { loadSpecBacklog, parseSpecPlan, specFrontier } from "../specs";

function issue(number: number, overrides: Partial<TrackedIssue> = {}): TrackedIssue {
  return {
    number,
    title: `Issue ${number}`,
    body: "Acceptance criteria",
    state: "OPEN",
    labels: ["type:ticket", "ready-for-agent"],
    assignees: [],
    parent: 10,
    blockers: [],
    ...overrides,
  };
}

function tracker(
  issues: TrackedIssue[],
  children = issues.filter((entry) => entry.parent === 10).map((x) => x.number),
) {
  const source: IssueTracker = {
    listSpecs: async () => issues.filter((entry) => entry.labels.includes("type:spec")),
    readIssue: async (number) => {
      const found = issues.find((entry) => entry.number === number);
      if (!found) throw new Error(`Missing issue ${number}`);
      return found;
    },
    readChildren: async () => children,
  };
  return source;
}

test("loads the complete Spec graph and unlocks an open dependency only after integration", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const backlog = await loadSpecBacklog(tracker([parent, issue(11), issue(12, { blockers: [11] })]));
  const graph = backlog.specs[0]!;
  expect(specFrontier(graph).ready.map((entry) => entry.number)).toEqual([11]);
  const advanced = specFrontier(graph, { integrated: new Set([11]) });
  expect(advanced.ready.map((entry) => entry.number)).toEqual([12]);
  expect(advanced.complete).toBe(false);
});

test("keeps unready children in scope and never completes an invalid or empty Spec", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const { specs } = await loadSpecBacklog(tracker([parent, issue(11), issue(12, { labels: ["type:ticket"] })]));
  const graph = specs[0]!;
  expect(graph.tickets.map((entry) => entry.number)).toEqual([11, 12]);
  expect(specFrontier(graph, { integrated: new Set([11]) }).complete).toBe(false);
  const malformed = { ...graph, tickets: [issue(11, { parent: 99 })] };
  expect(specFrontier(malformed, { integrated: new Set([11]) }).complete).toBe(false);
  expect(specFrontier({ ...graph, tickets: [] }).complete).toBe(false);
});

test("blocks a cycle and its dependents while leaving independent work ready", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const { specs } = await loadSpecBacklog(
    tracker([
      parent,
      issue(11, { blockers: [12] }),
      issue(12, { blockers: [11] }),
      issue(13, { blockers: [11] }),
      issue(14),
    ]),
  );
  const result = specFrontier(specs[0]!);
  expect(result.ready.map((entry) => entry.number)).toEqual([14]);
  expect(
    result.blocked
      .filter((entry) => entry.reasons.some((reason) => reason.includes("循环")))
      .map((entry) => entry.number),
  ).toEqual([11, 12, 13]);
});

test("reads every native child and dependency page rather than the first ready subset", async () => {
  const source = createGitHubIssueTracker("unused", async (args) => {
    if (args[0] === "issue")
      return JSON.stringify({
        number: Number(args[2]),
        title: "Native ticket",
        body: "Acceptance",
        state: "OPEN",
        labels: [{ name: "type:ticket" }, { name: "ready-for-agent" }],
        assignees: [],
        parent: { number: 10 },
      });
    expect(args).toContain("--paginate");
    expect(args).toContain("--slurp");
    if (args[1]?.includes("sub_issues")) return JSON.stringify([[{ number: 11 }], [{ number: 12 }]]);
    if (args[1]?.includes("blocked_by")) return JSON.stringify([[{ number: 21 }], [{ number: 22 }]]);
    if (args[1]?.includes("/comments"))
      return JSON.stringify([
        [{ body: "First handoff", user: { login: "runner" } }],
        [{ body: "Latest handoff", user: { login: "runner" } }],
      ]);
    return JSON.stringify([[{ number: 10 }], [{ number: 20 }]]);
  });
  expect((await source.listSpecs()).map((entry) => entry.number)).toEqual([10, 20]);
  expect(await source.readChildren(10)).toEqual([11, 12]);
  const ticket = await source.readIssue(11);
  expect(ticket.parent).toBe(10);
  expect(ticket.blockers).toEqual([21, 22]);
  expect(ticket.comments?.map((entry) => entry.body)).toEqual(["First handoff", "Latest handoff"]);
});

test("requires delivered cross-Spec prerequisites even when their issue is closed", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"], blockers: [21] });
  const { specs } = await loadSpecBacklog(
    tracker([parent, issue(11), issue(21, { parent: 20, state: "CLOSED" })], [11]),
  );
  expect(specFrontier(specs[0]!).ready).toEqual([]);
  expect(specFrontier(specs[0]!, { delivered: new Set([21]) }).ready.map((entry) => entry.number)).toEqual([11]);
});

test("keeps claimed work blocked unless ordinary recovery identifies it", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const { specs } = await loadSpecBacklog(tracker([parent, issue(11, { assignees: ["someone"] })]));
  expect(specFrontier(specs[0]!).ready).toEqual([]);
  expect(specFrontier(specs[0]!, { recoverable: new Set([11]) }).ready.map((entry) => entry.number)).toEqual([11]);
});

test("accepts Planner roles only for ready tickets in one selected Spec", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const backlog = await loadSpecBacklog(tracker([parent, issue(11), issue(12, { labels: ["type:ticket"] })]));
  const candidate = (number: number) => ({
    number,
    title: `Issue ${number}`,
    branch: `codex/sandcastle/issue-${number}`,
    implementer: "implementer_standard",
    reason: "Routine",
  });
  const plan = (number: number) => `<plan>${JSON.stringify({ spec: 10, issues: [candidate(number)] })}</plan>`;
  expect(parseSpecPlan(plan(11), backlog).tickets.map((entry) => entry.number)).toEqual([11]);
  expect(() => parseSpecPlan(plan(12), backlog)).toThrow();
  expect(() => parseSpecPlan(plan(10), backlog)).toThrow();
  expect(() => parseSpecPlan(plan(99), backlog)).toThrow();
  expect(parseSpecPlan('<plan>{"spec":null,"issues":[]}</plan>', backlog).tickets).toEqual([]);
});

const invalidTickets: Partial<TrackedIssue>[] = [
  { labels: ["ready-for-agent"] },
  { labels: ["type:spec", "type:ticket", "ready-for-agent"] },
  { parent: null },
  { parent: 99 },
  { state: "CLOSED" },
];
test.each(invalidTickets)("does not dispatch a ticket whose metadata is inconsistent: %j", async (overrides) => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const { specs } = await loadSpecBacklog(tracker([parent, issue(11, overrides), issue(12)], [11, 12]));
  const frontier = specFrontier(specs[0]!);
  expect(frontier.ready.map((entry) => entry.number)).toEqual([12]);
  expect(frontier.blocked.map((entry) => entry.number)).toEqual([11]);
});

test.each([{ labels: ["type:spec"] }, { labels: ["type:spec", "type:ticket", "ready-for-agent"] }])(
  "rejects a parent without valid type and readiness: %j",
  async ({ labels }) => {
    const { specs, rejected } = await loadSpecBacklog(
      tracker([issue(10, { parent: null, labels: [...labels] }), issue(11)]),
    );
    expect(specs).toEqual([]);
    expect(rejected.map((entry) => entry.number)).toEqual([10]);
  },
);

test("a malformed dependency cannot be unlocked by an unrelated integration claim", async () => {
  const parent = issue(10, { parent: null, labels: ["type:spec", "ready-for-agent"] });
  const { specs } = await loadSpecBacklog(
    tracker([parent, issue(11, { parent: null }), issue(12, { blockers: [11] })], [11, 12]),
  );
  expect(specFrontier(specs[0]!, { integrated: new Set([11]) }).ready).toEqual([]);
});
