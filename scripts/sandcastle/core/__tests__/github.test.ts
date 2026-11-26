import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  buildFallbackPrBody,
  ensurePr,
  findBranchConflicts,
  findOpenPr,
  pauseSpec,
  readSpecGraph,
  readSpecLabels,
  removeLabel,
  resolveTicketTier,
  retryGhRead,
  specFrontier,
} from "../github.ts";
import type { IntegratedTicket, SpecGraph, SpecIssue, TicketIssue } from "../types.ts";

const repo = "cyy1998/shgas-iam";
const shaA = "a".repeat(40);
const shaB = "b".repeat(40);
const shaC = "c".repeat(40);

const page = <T>(nodes: T[], hasNextPage = false) => ({
  nodes,
  pageInfo: { hasNextPage },
});

function graphIssueNode(
  number: number,
  options: {
    type?: "spec" | "ticket";
    state?: "OPEN" | "CLOSED";
    repository?: string;
    labels?: string[];
    body?: string;
    comments?: Array<{ author: { login: string } | null; body: string; createdAt: string }>;
    blockedBy?: Array<{ number: number; state: "OPEN" | "CLOSED"; repository: { nameWithOwner: string } }>;
    hasNextPage?: Partial<Record<"labels" | "comments" | "blockedBy", boolean>>;
  } = {},
) {
  const labels = options.labels ?? [`type:${options.type ?? "ticket"}`, "ready-for-agent"];
  return {
    number,
    title: `Issue ${number}`,
    body: options.body ?? "",
    state: options.state ?? "OPEN",
    repository: { nameWithOwner: options.repository ?? repo },
    labels: page(
      labels.map((name) => ({ name })),
      options.hasNextPage?.labels ?? false,
    ),
    comments: page(options.comments ?? [], options.hasNextPage?.comments ?? false),
    blockedBy: page(options.blockedBy ?? [], options.hasNextPage?.blockedBy ?? false),
  };
}

function makeSpec(number: number, overrides: Partial<SpecIssue> = {}): SpecIssue {
  return {
    repo,
    number,
    state: "OPEN",
    title: `Spec ${number}`,
    body: "",
    labels: ["type:spec", "ready-for-agent"],
    comments: [],
    blockers: [],
    ...overrides,
  };
}

function makeTicket(number: number, specNumber: number, overrides: Partial<TicketIssue> = {}): TicketIssue {
  return {
    repo,
    number,
    state: "OPEN",
    title: `Ticket ${number}`,
    body: "",
    labels: ["type:ticket", "ready-for-agent"],
    comments: [],
    blockers: [],
    parent: { repo, number: specNumber, state: "OPEN" },
    ...overrides,
  };
}

async function expectReject(operation: () => Promise<unknown>): Promise<Error> {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  return caught as Error;
}

test("readSpecGraph reads open specs, sub-issues, comments, and blockers in a single first:100 GraphQL query", async () => {
  const calls: string[][] = [];
  const graphs = await readSpecGraph(repo, {
    runGh: async (args) => {
      calls.push(args);
      expect(args.slice(0, 2)).toEqual(["api", "graphql"]);
      return JSON.stringify({
        data: {
          repository: {
            issues: page([
              {
                ...graphIssueNode(433, {
                  type: "spec",
                  body: "集成分支：feat/sandcastle-native-convergence",
                  comments: [
                    { author: { login: "alice" }, body: "Approved", createdAt: "2026-11-20T00:00:00Z" },
                    { author: null, body: "Deleted user note", createdAt: "2026-11-21T00:00:00Z" },
                  ],
                }),
                subIssues: page([
                  {
                    ...graphIssueNode(434, {
                      type: "ticket",
                      labels: ["type:ticket", "ready-for-agent", "agent:deep"],
                      blockedBy: [{ number: 10, state: "CLOSED", repository: { nameWithOwner: "other/repo" } }],
                    }),
                    parent: { number: 433, state: "OPEN", repository: { nameWithOwner: repo } },
                  },
                  {
                    ...graphIssueNode(436, {
                      type: "ticket",
                      blockedBy: [{ number: 434, state: "OPEN", repository: { nameWithOwner: repo } }],
                    }),
                    parent: { number: 433, state: "OPEN", repository: { nameWithOwner: repo } },
                  },
                ]),
              },
            ]),
          },
        },
      });
    },
  });

  expect(calls).toHaveLength(1);
  expect(graphs).toHaveLength(1);
  const [graph] = graphs;
  expect(graph?.spec.number).toBe(433);
  expect(graph?.spec.comments).toEqual([
    { author: "alice", body: "Approved", createdAt: "2026-11-20T00:00:00Z" },
    { author: "ghost", body: "Deleted user note", createdAt: "2026-11-21T00:00:00Z" },
  ]);
  expect(graph?.tickets.map((ticket) => ticket.number)).toEqual([434, 436]);
  expect(graph?.tickets[0]?.blockers).toEqual([{ repo: "other/repo", number: 10, state: "CLOSED" }]);
});

test.each(["issues", "subIssues", "specComments", "ticketBlockedBy"] as const)(
  "readSpecGraph throws explicitly when %s connection overflows first:100",
  async (overflowTarget) => {
    const err = await expectReject(() =>
      readSpecGraph(repo, {
        runGh: async () =>
          JSON.stringify({
            data: {
              repository: {
                issues: page(
                  [
                    {
                      ...graphIssueNode(433, {
                        type: "spec",
                        hasNextPage: { comments: overflowTarget === "specComments" },
                      }),
                      subIssues: page(
                        [
                          {
                            ...graphIssueNode(434, {
                              type: "ticket",
                              hasNextPage: { blockedBy: overflowTarget === "ticketBlockedBy" },
                            }),
                            parent: { number: 433, state: "OPEN", repository: { nameWithOwner: repo } },
                          },
                        ],
                        overflowTarget === "subIssues",
                      ),
                    },
                  ],
                  overflowTarget === "issues",
                ),
              },
            },
          }),
      }),
    );
    expect(err.message.toLowerCase()).toContain("overflow");
  },
);

test.each([
  "EOF",
  "connection reset by peer",
  "gh: Internal Server Error (HTTP 500)",
  "gh: Bad Gateway (HTTP 502)",
  "gh: HTTP 503",
  "gh: HTTP 504",
])("retryGhRead retries transient %s failures", async (stderr) => {
  let attempts = 0;
  const value = await retryGhRead(
    async () => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error("gh failed"), { stderr });
      return "ok";
    },
    { baseDelayMs: 0 },
  );
  expect(value).toBe("ok");
  expect(attempts).toBe(2);
});

test.each([
  ["gh: Validation failed (HTTP 422): EOF", 1],
  ["gh: Resource not accessible by integration (HTTP 403)", 1],
  ["Get https://api.github.com/graphql: unexpected EOF", 3],
])("retryGhRead stops after %i attempt(s) for %s", async (message, expectedAttempts) => {
  let attempts = 0;
  const failure = new Error(message);
  const caught = await expectReject(() =>
    retryGhRead(
      async () => {
        attempts++;
        throw failure;
      },
      { baseDelayMs: 0 },
    ),
  );
  expect(caught).toBe(failure);
  expect(attempts).toBe(expectedAttempts);
});

test("specFrontier computes ready/blocked/complete with internal trailer blockers and external CLOSED trust", () => {
  const graph: SpecGraph = {
    spec: makeSpec(433),
    tickets: [
      makeTicket(1, 433, {
        // External CLOSED blocker must be trusted and unblocked.
        blockers: [{ repo: "other/repo", number: 99, state: "CLOSED" }],
      }),
      makeTicket(2, 433, {
        // External OPEN blocker blocks ticket.
        blockers: [{ repo, number: 999, state: "OPEN" }],
      }),
      makeTicket(3, 433, {
        // Internal blocker #1 must be integrated (not merely CLOSED).
        blockers: [{ repo, number: 1, state: "CLOSED" }],
      }),
      makeTicket(4, 433, {
        // Not ready-for-agent.
        labels: ["type:ticket"],
      }),
      makeTicket(5, 433, {
        // Cycle 5 <-> 6.
        blockers: [{ repo, number: 6, state: "OPEN" }],
      }),
      makeTicket(6, 433, {
        blockers: [{ repo, number: 5, state: "OPEN" }],
      }),
    ],
  };

  const initial = specFrontier(graph);
  expect(initial.ready.map((t) => t.number)).toEqual([1]);
  expect(initial.complete).toBe(false);
  expect(initial.blocked.find((b) => b.number === 2)?.reasons.join(" ")).toContain("External blocker");
  expect(initial.blocked.find((b) => b.number === 3)?.reasons.join(" ")).toContain("not integrated");
  expect(initial.blocked.find((b) => b.number === 4)?.reasons.join(" ")).toContain("ready-for-agent");
  expect(initial.blocked.find((b) => b.number === 5)?.reasons.join(" ")).toContain("cycle");

  // Once #1 is integrated, #3 becomes ready.
  const after1 = specFrontier(graph, new Set([1]));
  expect(after1.ready.map((t) => t.number)).toEqual([3]);
  expect(after1.complete).toBe(false);

  // Clean spec with all tickets integrated is complete.
  const cleanGraph: SpecGraph = {
    spec: makeSpec(500),
    tickets: [makeTicket(501, 500), makeTicket(502, 500)],
  };
  expect(specFrontier(cleanGraph, new Set([501, 502]))).toEqual({
    ready: [],
    blocked: [],
    complete: true,
  });

  // Spec with needs-attention blocks all tickets and is not complete.
  const pausedGraph: SpecGraph = {
    spec: makeSpec(500, { labels: ["type:spec", "ready-for-agent", "needs-attention"] }),
    tickets: [makeTicket(501, 500)],
  };
  const paused = specFrontier(pausedGraph);
  expect(paused.ready).toEqual([]);
  expect(paused.complete).toBe(false);
  expect(paused.blocked[0]?.reasons.join(" ")).toContain("needs-attention");
});

test("resolveTicketTier maps agent:deep > agent:light > standard and rejects dual tier conflict", () => {
  expect(resolveTicketTier(["type:ticket", "ready-for-agent"])).toBe("standard");
  expect(resolveTicketTier(["type:ticket", "agent:light"])).toBe("light");
  expect(resolveTicketTier(["type:ticket", "agent:deep"])).toBe("deep");
  expect(resolveTicketTier(makeTicket(434, 433, { labels: ["type:ticket", "agent:deep"] }))).toBe("deep");
  expect(() => resolveTicketTier(["type:ticket", "agent:light", "agent:deep"])).toThrow(/agent:light.*agent:deep/);
});

test("findBranchConflicts only checks open Specs with ready-for-agent label", () => {
  const specs: SpecIssue[] = [
    makeSpec(422, {
      state: "OPEN",
      labels: ["type:spec"], // removed from queue — must NOT trigger conflict!
      body: "集成分支：feat/sandcastle-native-convergence",
    }),
    makeSpec(433, {
      state: "OPEN",
      labels: ["type:spec", "ready-for-agent"],
      body: "集成分支：feat/sandcastle-native-convergence",
    }),
    makeSpec(440, {
      state: "CLOSED",
      labels: ["type:spec", "ready-for-agent"],
      body: "Integration branch: feat/sandcastle-native-convergence",
    }),
  ];
  expect(findBranchConflicts(specs)).toEqual([]);

  const conflicting: SpecIssue[] = [
    ...specs,
    makeSpec(450, {
      state: "OPEN",
      labels: ["type:spec", "ready-for-agent"],
      body: "Integration branch: `feat/sandcastle-native-convergence`",
    }),
  ];
  expect(findBranchConflicts(conflicting)).toEqual([
    { branch: "feat/sandcastle-native-convergence", specNumbers: [433, 450] },
  ]);
});

test("readSpecLabels, pauseSpec, and removeLabel invoke expected gh operations", async () => {
  const calls: string[][] = [];
  let postedBody = "";
  let labelAttempts = 0;

  const runGh = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "api") {
      labelAttempts++;
      if (labelAttempts === 1) {
        throw Object.assign(new Error("gh failed"), { stderr: "gh: HTTP 502" });
      }
      return JSON.stringify({ labels: [{ name: "type:spec" }, { name: "ready-for-agent" }] });
    }
    if (args[0] === "issue" && args[1] === "comment") {
      const bodyFileIndex = args.indexOf("--body-file");
      const filePath = bodyFileIndex >= 0 ? args[bodyFileIndex + 1] : undefined;
      if (filePath) postedBody = await readFile(filePath, "utf8");
      return "";
    }
    return "";
  };

  const labels = await readSpecLabels(repo, 433, { runGh });
  expect(labels).toEqual(["type:spec", "ready-for-agent"]);
  expect(labelAttempts).toBe(2);

  await pauseSpec(repo, 433, "Merge conflict could not be resolved.", { runGh });
  expect(calls).toContainEqual(["issue", "edit", "433", "--repo", repo, "--add-label", "needs-attention"]);
  expect(postedBody).toBe("Merge conflict could not be resolved.");

  await removeLabel(repo, 434, "ready-for-agent", { runGh });
  expect(calls).toContainEqual(["issue", "edit", "434", "--repo", repo, "--remove-label", "ready-for-agent"]);
});

test("findOpenPr and ensurePr reuse matching Open PR, reject mismatched SHA, and build fallback PR body when draft is missing", async () => {
  const spec = makeSpec(433, { title: "Converge Sandcastle AFK" });
  const tickets = [
    makeTicket(434, 433, { title: "Core | primitives" }),
    makeTicket(435, 433, { title: "Thin adapter" }),
  ];
  const integrated = new Map<number, IntegratedTicket>([
    [434, { number: 434, mergeSha: shaA, candidateSha: shaB, handoff: "ok" }],
    [435, { number: 435, mergeSha: shaB, candidateSha: shaC, handoff: "ok" }],
  ]);

  // 1. Reuse matching open PR without calling gh pr create.
  const existingPr = {
    number: 428,
    url: `https://github.com/${repo}/pull/428`,
    state: "OPEN",
    headRefName: "feat/sandcastle-native-convergence",
    baseRefName: "main",
    headRefOid: shaC,
    isCrossRepository: false,
  };
  const reuseCalls: string[][] = [];
  const reused = await ensurePr(
    repo,
    {
      spec,
      tickets,
      integrated,
      headBranch: "feat/sandcastle-native-convergence",
      baseBranch: "main",
      headSha: shaC,
    },
    {
      runGh: async (args) => {
        reuseCalls.push(args);
        if (args[0] === "pr" && args[1] === "list") return JSON.stringify([existingPr]);
        throw new Error(`Unexpected gh call: ${args.join(" ")}`);
      },
    },
  );
  expect(reused).toEqual(existingPr);
  expect(reuseCalls).toHaveLength(1);

  // 2. Reject open PR whose headRefOid does not match expected headSha.
  const mismatchErr = await expectReject(() =>
    findOpenPr(
      repo,
      { headBranch: "feat/sandcastle-native-convergence", baseBranch: "main", headSha: shaA },
      { runGh: async () => JSON.stringify([existingPr]) },
    ),
  );
  expect(mismatchErr.message).toContain(shaA);

  // 3. Create PR with deterministic fallback body when draftBody is missing.
  let createdBody = "";
  const createCalls: string[][] = [];
  const created = await ensurePr(
    repo,
    {
      spec,
      tickets,
      integrated,
      headBranch: "feat/sandcastle-native-convergence",
      baseBranch: "main",
      headSha: shaC,
      draft: true,
    },
    {
      runGh: async (args) => {
        createCalls.push(args);
        if (args[0] === "pr" && args[1] === "list") return JSON.stringify([]);
        if (args[0] === "pr" && args[1] === "create") {
          expect(args).toContain("--draft");
          const bodyFileIndex = args.indexOf("--body-file");
          const filePath = bodyFileIndex >= 0 ? args[bodyFileIndex + 1] : undefined;
          if (filePath) createdBody = await readFile(filePath, "utf8");
          return `https://github.com/${repo}/pull/499\n`;
        }
        if (args[0] === "pr" && args[1] === "view") {
          return JSON.stringify({ ...existingPr, number: 499, url: `https://github.com/${repo}/pull/499` });
        }
        throw new Error(`Unexpected gh call: ${args.join(" ")}`);
      },
    },
  );
  expect(created.number).toBe(499);
  expect(createCalls.map((c) => c.slice(0, 2))).toEqual([
    ["pr", "list"],
    ["pr", "create"],
    ["pr", "view"],
  ]);
  expect(createdBody).toContain("Closes #433");
  expect(createdBody).toContain("Closes #434");
  expect(createdBody).toContain("Closes #435");
  expect(createdBody).toContain("Core \\| primitives");
  expect(createdBody).toContain(`\`${shaA}\``);
  expect(createdBody).toContain(`\`${shaB}\``);

  // 4. Direct buildFallbackPrBody check.
  const fallback = buildFallbackPrBody({
    spec,
    tickets,
    integrated,
    baseBranch: "main",
    headBranch: "feat/sandcastle-native-convergence",
    headSha: shaC,
  });
  expect(fallback).toBe(createdBody);

  // 5. Create PR with explicit <pr-body> draft preserves the draft and appends Closes + tickets table.
  let draftCreatedBody = "";
  const withDraft = await ensurePr(
    repo,
    {
      spec,
      tickets,
      integrated,
      headBranch: "feat/sandcastle-native-convergence",
      baseBranch: "main",
      headSha: shaC,
      draftBody: "## Summary\n\nCustom repair draft.",
    },
    {
      runGh: async (args) => {
        if (args[0] === "pr" && args[1] === "list") return JSON.stringify([]);
        if (args[0] === "pr" && args[1] === "create") {
          expect(args).not.toContain("--draft");
          const bodyFileIndex = args.indexOf("--body-file");
          const filePath = bodyFileIndex >= 0 ? args[bodyFileIndex + 1] : undefined;
          if (filePath) draftCreatedBody = await readFile(filePath, "utf8");
          return `https://github.com/${repo}/pull/500\n`;
        }
        if (args[0] === "pr" && args[1] === "view") {
          return JSON.stringify({ ...existingPr, number: 500, url: `https://github.com/${repo}/pull/500` });
        }
        throw new Error(`Unexpected gh call: ${args.join(" ")}`);
      },
    },
  );
  expect(withDraft.number).toBe(500);
  expect(draftCreatedBody).toContain("Custom repair draft.");
  expect(draftCreatedBody).toContain("Closes #433");
  expect(draftCreatedBody).toContain("## Integrated Tickets");
});
