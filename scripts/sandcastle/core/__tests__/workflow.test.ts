import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AgentProvider,
  type BindMountCreateOptions,
  type BindMountSandboxHandle,
  type BindMountSandboxProvider,
  createBindMountSandboxProvider,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";
import { command } from "../command.ts";
import { type AfkOptions, checkAfk, type PullRequestInfo, runAfk } from "../index.ts";
import { commit } from "./git-fixture.ts";

const repo = "fixture/engine";
const complete = "<promise>COMPLETE</promise>";
const specBranch = "feat/fixture";

type FakeIssue = {
  number: number;
  title: string;
  body: string;
  state: "OPEN" | "CLOSED";
  labels: Set<string>;
  comments: Array<{ author: string; body: string; createdAt: string }>;
  blockers: Array<{ number: number; state: "OPEN" | "CLOSED"; repo?: string }>;
  subIssues?: number[];
  parent?: number;
};

type RecordedCall = {
  options: RunOptions;
  mounts: BindMountCreateOptions["mounts"];
  worktreePath: string;
};

function makeAgent(name: string): AgentProvider {
  return {
    name,
    env: {},
    captureSessions: false,
    buildPrintCommand: () => ({ command: `echo ${name}` }),
    parseStreamLine: (line) => [{ type: "text", text: line }],
  };
}

function makeResult(stdout: string, branch = ""): RunResult {
  return {
    stdout,
    branch,
    commits: [],
    iterations: [{ sessionId: "fixture-session" }],
    completionSignal: stdout.includes(complete) ? complete : undefined,
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

async function assertPromptArgsComplete(options: RunOptions): Promise<string> {
  expect(options.promptFile).toBeDefined();
  const template = await readFile(options.promptFile as string, "utf8");
  const args = options.promptArgs ?? {};
  for (const [, key] of template.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g)) {
    if (!key || key === "SOURCE_BRANCH" || key === "TARGET_BRANCH") continue;
    expect(Object.hasOwn(args, key)).toBe(true);
    expect(args[key]).not.toBeUndefined();
  }
  return template;
}

async function withFixture(
  runTest: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
  ticketNumbers = [41],
) {
  const root = await mkdtemp(join(tmpdir(), "sandcastle-afk-"));
  try {
    await runTest(await createFixture(root, ticketNumbers));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function createFixture(root: string, ticketNumbers: number[]) {
  const cwd = join(root, "repo");
  const remotePath = join(root, "remote.git");
  const git = (...args: string[]) => command("git", args, cwd);

  await command("git", ["init", "--bare", "-b", "main", remotePath], root);
  await command("git", ["init", "-b", "main", cwd], root);
  await git("config", "user.name", "Fixture Bot");
  await git("config", "user.email", "fixture@example.test");
  await git("remote", "add", "origin", remotePath);
  const baseSha = await commit(cwd, "shared.txt", "base\n");
  await writeFile(join(cwd, ".git", "info", "exclude"), "\n.sandcastle/\n");
  await git("push", "-u", "origin", "main");

  const issues = new Map<number, FakeIssue>();
  issues.set(40, {
    number: 40,
    title: "Fixture Spec 40",
    body: `Integration branch: \`${specBranch}\`\n\nDeliver the fixture feature.`,
    state: "OPEN",
    labels: new Set(["type:spec", "ready-for-agent"]),
    comments: [{ author: "maintainer", body: "Spec approved", createdAt: "2026-11-20T00:00:00Z" }],
    blockers: [],
    subIssues: [...ticketNumbers],
  });
  for (const num of ticketNumbers) {
    issues.set(num, {
      number: num,
      title: `Ticket ${num}`,
      body: `Implement ticket #${num}.`,
      state: "OPEN",
      labels: new Set(["type:ticket", "ready-for-agent"]),
      comments: [],
      blockers: [],
      parent: 40,
    });
  }

  const agents = {
    implementLight: { provider: makeAgent("implement-light"), instructions: "Light role instructions" },
    implementStandard: { provider: makeAgent("implement-standard"), instructions: "Standard role instructions" },
    implementDeep: { provider: makeAgent("implement-deep"), instructions: "Deep role instructions" },
    reviewStandards: { provider: makeAgent("review-standards"), instructions: "Standards reviewer instructions" },
    reviewSpec: { provider: makeAgent("review-spec"), instructions: "Spec reviewer instructions" },
    repair: { provider: makeAgent("repair-deep"), instructions: "Repair deep instructions" },
  };

  let pr: PullRequestInfo | undefined;
  let prCreateCount = 0;
  let lastPrBody = "";
  const ghLog: string[][] = [];
  const events: string[] = [];
  const calls: RecordedCall[] = [];
  const reports: string[] = [];
  const sandboxContexts: Array<{ phase: string; readonly: boolean; runId: string }> = [];
  const cleanedRunIds: string[] = [];

  let beforeGh: ((args: string[]) => Promise<void>) | undefined;
  let onAgent:
    | ((ctx: {
        options: RunOptions;
        worktreePath: string;
        mounts: BindMountCreateOptions["mounts"];
      }) => Promise<RunResult | undefined>)
    | undefined;

  const remoteBranchHead = async (branch = specBranch): Promise<string | undefined> => {
    const out = await command("git", ["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`], remotePath);
    return out || undefined;
  };

  const page = <T>(nodes: T[]) => ({ nodes, pageInfo: { hasNextPage: false } });

  const formatGraphNode = (issue: FakeIssue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    repository: { nameWithOwner: repo },
    labels: page([...issue.labels].map((name) => ({ name }))),
    comments: page(issue.comments.map((c) => ({ author: { login: c.author }, body: c.body, createdAt: c.createdAt }))),
    blockedBy: page(
      issue.blockers.map((b) => ({
        number: b.number,
        state: b.state,
        repository: { nameWithOwner: b.repo ?? repo },
      })),
    ),
  });

  const runGh = async (args: string[]): Promise<string> => {
    ghLog.push([...args]);
    await beforeGh?.(args);
    const [op, sub] = args;

    if (op === "api" && sub === "graphql") {
      const queryArg = args.find((arg) => arg.startsWith("query=")) ?? "";
      if (queryArg.includes("ListOpenSpecs")) {
        const specNumbers = [...issues.values()]
          .filter((item) => item.state === "OPEN" && item.labels.has("type:spec"))
          .map((spec) => ({ number: spec.number }));
        return JSON.stringify({ data: { repository: { issues: page(specNumbers) } } });
      }
      const numArg = args.find((arg) => arg.startsWith("number="));
      const specNum = Number(numArg?.slice("number=".length));
      const spec = issues.get(specNum);
      if (!spec) return JSON.stringify({ data: { repository: { issue: null } } });
      return JSON.stringify({
        data: {
          repository: {
            issue: {
              ...formatGraphNode(spec),
              subIssues: page(
                (spec.subIssues ?? []).map((num) => {
                  const child = issues.get(num);
                  if (!child) throw new Error(`Missing fixture sub-issue #${num}`);
                  return {
                    ...formatGraphNode(child),
                    parent:
                      child.parent !== undefined
                        ? {
                            number: child.parent,
                            state: issues.get(child.parent)?.state ?? "OPEN",
                            repository: { nameWithOwner: repo },
                          }
                        : null,
                  };
                }),
              ),
            },
          },
        },
      });
    }

    if (op === "api" && sub?.startsWith(`repos/${repo}/issues/`)) {
      const num = Number(sub.split("/").at(-1));
      const found = issues.get(num);
      if (!found) throw new Error(`Missing fixture issue #${num}`);
      return JSON.stringify({ labels: [...found.labels].map((name) => ({ name })) });
    }

    if (op === "pr" && sub === "list") {
      if (args.includes("--limit") && args[args.indexOf("--limit") + 1] === "1") {
        return JSON.stringify(pr ? [{ number: pr.number }] : []);
      }
      const head = args[args.indexOf("--head") + 1];
      const base = args[args.indexOf("--base") + 1];
      const matching = pr && (!head || pr.headRefName === head) && (!base || pr.baseRefName === base) ? [pr] : [];
      return JSON.stringify(matching);
    }

    if (op === "pr" && sub === "create") {
      const head = args[args.indexOf("--head") + 1] ?? specBranch;
      const base = args[args.indexOf("--base") + 1] ?? "main";
      const remoteSha = await remoteBranchHead(head);
      if (!remoteSha) throw new Error(`Branch ${head} was not pushed to remote before gh pr create.`);
      const bodyFile = args[args.indexOf("--body-file") + 1] ?? "";
      lastPrBody = await readFile(bodyFile, "utf8");
      prCreateCount++;
      pr = {
        number: 99,
        url: `https://github.com/${repo}/pull/99`,
        state: "OPEN",
        headRefName: head,
        baseRefName: base,
        headRefOid: remoteSha,
        isCrossRepository: false,
        body: lastPrBody,
      };
      events.push("pr:create");
      return pr.url;
    }

    if (op === "pr" && sub === "edit") {
      if (!pr) throw new Error("No open PR to edit.");
      const bodyFile = args[args.indexOf("--body-file") + 1] ?? "";
      lastPrBody = await readFile(bodyFile, "utf8");
      pr = { ...pr, body: lastPrBody };
      events.push("pr:edit");
      return "";
    }

    if (op === "pr" && sub === "view") {
      if (!pr) throw new Error("No open PR to view.");
      return JSON.stringify(pr);
    }

    if (op === "issue" && sub === "edit") {
      const num = Number(args[2]);
      const target = issues.get(num);
      if (!target) throw new Error(`Missing fixture issue #${num}`);
      const addIdx = args.indexOf("--add-label");
      if (addIdx >= 0) {
        const label = args[addIdx + 1] ?? "";
        target.labels.add(label);
        events.push(`label:add:${num}:${label}`);
      }
      const removeIdx = args.indexOf("--remove-label");
      if (removeIdx >= 0) {
        const label = args[removeIdx + 1] ?? "";
        target.labels.delete(label);
        events.push(`label:remove:${num}:${label}`);
      }
      return "";
    }

    if (op === "issue" && sub === "comment") {
      const num = Number(args[2]);
      const target = issues.get(num);
      if (!target) throw new Error(`Missing fixture issue #${num}`);
      const bodyFile = args[args.indexOf("--body-file") + 1] ?? "";
      const body = await readFile(bodyFile, "utf8");
      target.comments.push({ author: "sandcastle-bot", body, createdAt: new Date().toISOString() });
      events.push(`comment:${num}`);
      return "";
    }

    throw new Error(`Unexpected gh invocation: ${JSON.stringify(args)}`);
  };

  const sandboxFactory: AfkOptions["sandbox"] = (ctx) => {
    sandboxContexts.push({ ...ctx });
    const provider: BindMountSandboxProvider = createBindMountSandboxProvider({
      name: "fixture-bind-mount",
      env: {},
      sandboxHomedir: "/home/agent",
      create: async (createOptions) => {
        const handle: BindMountSandboxHandle = {
          worktreePath: "/home/agent/workspace",
          exec: async () => ({ stdout: "", stderr: "", exitCode: 0 }),
          copyFileIn: async () => {},
          copyFileOut: async () => {},
          close: async () => {},
        };
        (handle as unknown as { observedMounts: BindMountCreateOptions["mounts"] }).observedMounts =
          createOptions.mounts;
        return handle;
      },
    });
    return {
      sandbox: provider,
      hooks: ctx.readonly ? undefined : { sandbox: { onSandboxReady: [{ command: "true" }] } },
      cleanup: async () => {
        cleanedRunIds.push(ctx.runId);
      },
    };
  };

  const runAgent = async (options: RunOptions): Promise<RunResult> => {
    await assertPromptArgsComplete(options);
    const repoCwd = options.cwd ?? cwd;
    const strategy = options.branchStrategy;
    let worktreePath = repoCwd;
    let createdTempWorktree = false;

    if (strategy && strategy.type === "branch") {
      const branch = strategy.branch;
      const baseRef = strategy.baseBranch ?? "HEAD";
      worktreePath = join(root, `agent-wt-${branch.replaceAll("/", "-")}-${Math.random().toString(36).slice(2, 8)}`);
      const existing = await command(
        "git",
        ["for-each-ref", "--format=%(objectname)", `refs/heads/${branch}`],
        repoCwd,
      );
      if (existing) {
        await command("git", ["worktree", "add", "--", worktreePath, branch], repoCwd);
      } else {
        await command("git", ["worktree", "add", "-b", branch, "--", worktreePath, baseRef], repoCwd);
      }
      createdTempWorktree = true;
    }

    try {
      // Exercise sandbox.create() to observe readonlySandbox mount wrapping end-to-end.
      let observedMounts: BindMountCreateOptions["mounts"] = [];
      if ("create" in options.sandbox && typeof options.sandbox.create === "function") {
        const createFn = options.sandbox.create as (opts: BindMountCreateOptions) => Promise<BindMountSandboxHandle>;
        const handle = await createFn({
          worktreePath,
          hostRepoPath: repoCwd,
          mounts: [
            { hostPath: worktreePath, sandboxPath: "/home/agent/workspace" },
            { hostPath: join(cwd, ".git"), sandboxPath: "/home/agent/.git", readonly: false },
          ],
          env: {},
        });
        observedMounts =
          (handle as unknown as { observedMounts?: BindMountCreateOptions["mounts"] }).observedMounts ?? [];
        await handle.close();
      }

      calls.push({ options, mounts: observedMounts, worktreePath });
      const override = await onAgent?.({ options, worktreePath, mounts: observedMounts });
      if (override) return override;

      if (options.name === "implement") {
        const branch = strategy && strategy.type === "branch" ? strategy.branch : "unknown";
        const fileName = `${branch.replaceAll("/", "-")}.txt`;
        await commit(worktreePath, fileName, `implemented ${branch}\n`);
        return makeResult(`Verified ${branch} with bun test.\n${complete}`, branch);
      }
      if (options.name === "review-standards") {
        return makeResult(`Standards axis: no issues.\n${complete}`);
      }
      if (options.name === "review-spec") {
        return makeResult(`Spec axis: all criteria satisfied.\n${complete}`);
      }
      if (options.name === "repair-and-verify") {
        return makeResult(
          `Final verification passed.\n<pr-body>## Summary\n\nRepair draft summary.</pr-body>\n${complete}`,
        );
      }
      return makeResult(`Completed ${options.name ?? "phase"}.\n${complete}`);
    } finally {
      if (createdTempWorktree) {
        await command("git", ["worktree", "remove", "--force", "--", worktreePath], repoCwd).catch(() => {});
      }
    }
  };

  return {
    root,
    cwd,
    remotePath,
    baseSha,
    git,
    issues,
    agents,
    ghLog,
    events,
    calls,
    reports,
    sandboxContexts,
    cleanedRunIds,
    remoteBranchHead,
    get pr() {
      return pr;
    },
    set pr(value: PullRequestInfo | undefined) {
      pr = value;
    },
    get prCreateCount() {
      return prCreateCount;
    },
    get lastPrBody() {
      return lastPrBody;
    },
    set beforeGh(fn: typeof beforeGh) {
      beforeGh = fn;
    },
    set onAgent(fn: typeof onAgent) {
      onAgent = fn;
    },
    run: (overrides: Partial<AfkOptions> = {}) =>
      runAfk(
        {
          repo,
          cwd,
          agents,
          sandbox: sandboxFactory,
          ...overrides,
        },
        {
          runAgent,
          runGh,
          report: (message) => reports.push(message),
        },
      ),
    runGh,
  };
}

test("parallel dispatch, tier routing, serial merge with handoff, concurrent readonly review, and exact ordered delivery leave dirty local checkout untouched", async () => {
  await withFixture(
    async (fixture) => {
      // Put host checkout on a dirty non-main branch to prove local checkout is never touched.
      await fixture.git("checkout", "-b", "interactive/wip");
      const wipHead = await commit(fixture.cwd, "wip.txt", "interactive work\n");
      await writeFile(join(fixture.cwd, "shared.txt"), "dirty local edit\n");
      await writeFile(join(fixture.cwd, "untracked.txt"), "keep local untracked\n");

      // Add a later Spec #50 to prove earliest Spec #40 is selected first.
      fixture.issues.set(50, {
        number: 50,
        title: "Later Spec 50",
        body: "Integration branch: feat/later-50",
        state: "OPEN",
        labels: new Set(["type:spec", "ready-for-agent"]),
        comments: [],
        blockers: [],
        subIssues: [51],
      });
      fixture.issues.set(51, {
        number: 51,
        title: "Ticket 51",
        body: "Later ticket",
        state: "OPEN",
        labels: new Set(["type:ticket", "ready-for-agent"]),
        comments: [],
        blockers: [],
        parent: 50,
      });

      // Configure tiers & dependency: #41 (light) and #42 (standard) parallel; #43 (deep) blocked by #41.
      fixture.issues.get(41)?.labels.add("agent:light");
      fixture.issues.get(43)?.labels.add("agent:deep");
      fixture.issues.get(43)?.blockers.push({ number: 41, state: "OPEN" });

      const parallelGate = Promise.withResolvers<void>();
      const reviewGate = Promise.withResolvers<void>();
      const startedTickets = new Set<string>();
      const startedReviews = new Set<string>();
      const observedOrder: string[] = [];

      const origBeforeGh = fixture.beforeGh;
      fixture.beforeGh = async (args) => {
        await origBeforeGh?.(args);
        if (args[0] === "pr" && args[1] === "create") {
          // Verify remote already has specBranch tip before gh pr create.
          expect(await fixture.remoteBranchHead()).toBeDefined();
          observedOrder.push("pr:create");
        }
        if (args[0] === "issue" && args[1] === "edit" && args.includes("--remove-label")) {
          const num = Number(args[2]);
          const worktrees = await fixture.git("worktree", "list", "--porcelain");
          const specWtPresent = worktrees.includes(".sandcastle/worktrees/");
          const t41Branch = await fixture.git("branch", "--list", "sandcastle/ticket-41");
          if (num === 40) {
            // Spec untag MUST happen LAST — after worktree & ticket branch cleanup!
            expect(specWtPresent).toBe(false);
            expect(t41Branch).toBe("");
            observedOrder.push("untag:spec:40");
          } else {
            // Ticket untags MUST happen BEFORE cleanup!
            expect(specWtPresent).toBe(true);
            observedOrder.push(`untag:ticket:${num}`);
          }
        }
      };

      fixture.onAgent = async ({ options, worktreePath, mounts }) => {
        if (options.name === "implement") {
          const branch = options.branchStrategy?.type === "branch" ? options.branchStrategy.branch : "";
          startedTickets.add(branch);
          if (branch === "sandcastle/ticket-41" || branch === "sandcastle/ticket-42") {
            if (startedTickets.has("sandcastle/ticket-41") && startedTickets.has("sandcastle/ticket-42")) {
              parallelGate.resolve();
            }
            await parallelGate.promise;
          }
          if (branch === "sandcastle/ticket-43") {
            const log = await command("git", ["log", "--first-parent", "--format=%B"], worktreePath);
            expect(log).toContain("Sandcastle-Ticket: #41");
            expect(options.agent).toBe(fixture.agents.implementDeep.provider);
            expect(options.promptArgs?.ROLE_INSTRUCTIONS).toBe("Deep role instructions");
          }
          if (branch === "sandcastle/ticket-41") {
            expect(options.agent).toBe(fixture.agents.implementLight.provider);
            expect(options.promptArgs?.ROLE_INSTRUCTIONS).toBe("Light role instructions");
          }
          if (branch === "sandcastle/ticket-42") {
            expect(options.agent).toBe(fixture.agents.implementStandard.provider);
            expect(options.promptArgs?.ROLE_INSTRUCTIONS).toBe("Standard role instructions");
          }
          expect(options.promptArgs?.SPEC).toContain("Spec approved");
          expect(options.promptArgs?.TICKET).toContain("Implement ticket #");
          expect(mounts.some((m) => m.readonly !== true)).toBe(true);
          return undefined;
        }
        if (options.name === "review-standards" || options.name === "review-spec") {
          expect(options.branchStrategy).toEqual({ type: "head" });
          expect(options.hooks).toBeUndefined();
          expect(mounts.length).toBeGreaterThan(0);
          expect(mounts.every((m) => m.readonly === true)).toBe(true);
          startedReviews.add(options.name);
          if (startedReviews.size === 2) reviewGate.resolve();
          await reviewGate.promise;
          return undefined;
        }
        if (options.name === "repair-and-verify") {
          expect(options.agent).toBe(fixture.agents.repair.provider);
          expect(options.branchStrategy).toEqual({ type: "head" });
          expect(options.promptArgs?.REVIEW_REPORT).toContain("Standards axis: no issues.");
          expect(options.promptArgs?.REVIEW_REPORT).toContain("Spec axis: all criteria satisfied.");
          return undefined;
        }
        return undefined;
      };

      const result = await fixture.run({ maxSpecs: 1, maxParallel: 2 });
      expect(result.attemptedSpecs).toEqual([40]);
      expect(result.delivered).toEqual([40]);
      expect(result.paused).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.integrated.toSorted()).toEqual([41, 42, 43]);

      // Verify exact delivery order.
      expect(observedOrder).toEqual([
        "pr:create",
        "untag:ticket:41",
        "untag:ticket:42",
        "untag:ticket:43",
        "untag:spec:40",
      ]);

      // Verify every opened sandbox session ran cleanup.
      expect(fixture.cleanedRunIds).toHaveLength(fixture.sandboxContexts.length);
      expect(fixture.sandboxContexts).toHaveLength(6); // 3 implement + 2 review + 1 repair

      // Verify merge commits carry Sandcastle-Ticket trailers & verification handoffs.
      const mergeBodies = await fixture.git(
        "log",
        "--first-parent",
        "--merges",
        "-z",
        "--format=%B",
        `${fixture.baseSha}..${specBranch}`,
      );
      const messages = mergeBodies.split("\0").filter(Boolean);
      expect(messages).toHaveLength(3);
      for (const num of [41, 42, 43]) {
        const msg = messages.find((m) => m.includes(`Sandcastle-Ticket: #${num}`));
        expect(msg).toBeDefined();
        expect(msg).toContain(`Verified sandcastle/ticket-${num} with bun test.`);
      }

      // Verify local Spec branch ref preserved, worktrees & ticket branches removed.
      const localSpecTip = await fixture.git("rev-parse", specBranch);
      const remoteSpecTip = await fixture.remoteBranchHead();
      expect(remoteSpecTip).toBe(localSpecTip);
      expect(await fixture.git("worktree", "list", "--porcelain")).not.toContain(".sandcastle/worktrees/");
      expect(await fixture.git("branch", "--list", "sandcastle/*")).toBe("");

      // Verify PR body has custom repair draft + Closes + Integrated Tickets.
      expect(fixture.lastPrBody).toContain("Repair draft summary.");
      expect(fixture.lastPrBody).toContain("Closes #40");
      expect(fixture.lastPrBody).toContain("Closes #41");
      expect(fixture.lastPrBody).toContain("Closes #42");
      expect(fixture.lastPrBody).toContain("Closes #43");
      expect(fixture.lastPrBody).toContain("## Integrated Tickets");

      // Verify local dirty checkout was completely untouched.
      expect(await fixture.git("symbolic-ref", "--short", "HEAD")).toBe("interactive/wip");
      expect(await fixture.git("rev-parse", "HEAD")).toBe(wipHead);
      expect(await readFile(join(fixture.cwd, "shared.txt"), "utf8")).toBe("dirty local edit\n");
      expect(await readFile(join(fixture.cwd, "untracked.txt"), "utf8")).toBe("keep local untracked\n");
    },
    [41, 42, 43],
  );
});

test("real merge conflict runs one resolve-conflict session and integrates cleanly; persistent conflict pauses Spec", async () => {
  // Case A: Conflict resolved in one session.
  await withFixture(
    async (fixture) => {
      const gate = Promise.withResolvers<void>();
      let started = 0;
      let resolveCalls = 0;

      fixture.onAgent = async ({ options, worktreePath }) => {
        if (options.name === "implement") {
          started++;
          if (started === 2) gate.resolve();
          await gate.promise;
          const branch = options.branchStrategy?.type === "branch" ? options.branchStrategy.branch : "";
          await commit(worktreePath, "shared.txt", branch.endsWith("-41") ? "side-41\n" : "side-42\n");
          return makeResult(`Implemented ${branch}.\n${complete}`, branch);
        }
        if (options.name === "resolve-conflict") {
          resolveCalls++;
          const conflictBase = String(options.promptArgs?.CONFLICT_BASE ?? "");
          expect(conflictBase).toMatch(/^[a-f0-9]{40}$/);
          const mergeErr = await command("git", ["merge", "--no-ff", conflictBase], worktreePath).catch((e) => e);
          expect(mergeErr).toBeInstanceOf(Error);
          await writeFile(join(worktreePath, "shared.txt"), "combined-41-and-42\n");
          await command("git", ["add", "shared.txt"], worktreePath);
          await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "--no-edit"], worktreePath);
          return makeResult(`Conflict resolved and verified.\n${complete}`);
        }
        return undefined;
      };

      const result = await fixture.run({ maxParallel: 2 });
      expect(result.delivered).toEqual([40]);
      expect(resolveCalls).toBe(1);
      expect(await fixture.git("show", `${specBranch}:shared.txt`)).toBe("combined-41-and-42");
    },
    [41, 42],
  );

  // Case B: Conflict resolution fails to include CONFLICT_BASE -> pauses Spec with needs-attention, no second retry.
  await withFixture(
    async (fixture) => {
      const gate = Promise.withResolvers<void>();
      let started = 0;
      let resolveCalls = 0;

      fixture.onAgent = async ({ options, worktreePath }) => {
        if (options.name === "implement") {
          started++;
          if (started === 2) gate.resolve();
          await gate.promise;
          const branch = options.branchStrategy?.type === "branch" ? options.branchStrategy.branch : "";
          await commit(worktreePath, "shared.txt", branch.endsWith("-41") ? "side-41\n" : "side-42\n");
          return makeResult(`Implemented ${branch}.\n${complete}`, branch);
        }
        if (options.name === "resolve-conflict") {
          resolveCalls++;
          return makeResult(`Claimed complete without merging conflict base.\n${complete}`);
        }
        return undefined;
      };

      const result = await fixture.run({ maxParallel: 2 });
      expect(result.delivered).toEqual([]);
      expect(result.paused).toEqual([40]);
      expect(resolveCalls).toBe(1);
      expect(fixture.prCreateCount).toBe(0);
      expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
      expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(true);
      expect(await fixture.git("worktree", "list", "--porcelain")).toContain(".sandcastle/worktrees/");
    },
    [41, 42],
  );
});

test("reuses candidate SHA review cache and succeeds even when remote main advances mid-run, invalidating cache only when candidate SHA changes", async () => {
  await withFixture(async (fixture) => {
    // Run 1: Ticket #41 merges, reviews run and cache, then repair fails without changing HEAD.
    fixture.onAgent = async ({ options }) => {
      if (options.name === "repair-and-verify") {
        return makeResult("Tests flaked without completion marker.");
      }
      return undefined;
    };

    const first = await fixture.run();
    expect(first.integrated).toEqual([41]);
    expect(first.paused).toEqual([40]);
    expect(fixture.calls.map((c) => c.options.name)).toEqual([
      "implement",
      "review-standards",
      "review-spec",
      "repair-and-verify",
    ]);
    expect(fixture.prCreateCount).toBe(0);

    // Advance remote main via an independent clone while AFK is paused.
    const otherClone = join(fixture.root, "other-clone");
    await command("git", ["clone", "-b", "main", fixture.remotePath, otherClone], fixture.root);
    await command("git", ["config", "user.name", "Other Dev"], otherClone);
    await command("git", ["config", "user.email", "other@example.test"], otherClone);
    const advancedMain = await commit(otherClone, "main-only.txt", "main advanced\n");
    await command("git", ["push", "origin", "main"], otherClone);

    // Clear needs-attention and restart.
    fixture.issues.get(40)?.labels.delete("needs-attention");
    fixture.calls.length = 0;
    fixture.onAgent = async ({ options }) => {
      if (options.name === "repair-and-verify") {
        // merge-base MUST still be the original baseSha, NOT advancedMain!
        expect(options.promptArgs?.BASE_SHA).toBe(fixture.baseSha);
        expect(options.promptArgs?.BASE_SHA).not.toBe(advancedMain);
        expect(options.promptArgs?.REVIEW_REPORT).toContain("Standards axis: no issues.");
        expect(options.promptArgs?.REVIEW_REPORT).toContain("Spec axis: all criteria satisfied.");
      }
      return undefined;
    };

    const second = await fixture.run();
    expect(second.delivered).toEqual([40]);
    // Ticket #41 NOT re-run, dual-axis reviews HIT candidate SHA cache (NOT re-run), only repair runs!
    expect(fixture.calls.map((c) => c.options.name)).toEqual(["repair-and-verify"]);
    expect(fixture.prCreateCount).toBe(1);
    expect(await fixture.remoteBranchHead()).toBe(await fixture.git("rev-parse", specBranch));
  });

  // Also verify cache invalidates when repair commits a new SHA before failing.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "repair-and-verify") {
        await commit(worktreePath, "repair-fix.txt", "fix commit\n");
        return makeResult("Committed fix then timed out before verify.");
      }
      return undefined;
    };
    const first = await fixture.run();
    expect(first.paused).toEqual([40]);

    fixture.issues.get(40)?.labels.delete("needs-attention");
    fixture.calls.length = 0;
    fixture.onAgent = undefined;
    const second = await fixture.run();
    expect(second.delivered).toEqual([40]);
    expect(
      fixture.calls
        .map((c) => c.options.name)
        .slice(0, 2)
        .sort(),
    ).toEqual(["review-spec", "review-standards"]);
    expect(fixture.calls.map((c) => c.options.name)[2]).toBe("repair-and-verify");
  });
});

test("missing <pr-body> from repair-and-verify falls back to deterministic host PR body with zero follow-up sessions", async () => {
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options }) => {
      if (options.name === "repair-and-verify") {
        return makeResult(`All checks passed, forgot pr-body tag.\n${complete}`);
      }
      return undefined;
    };

    const result = await fixture.run({ draft: true });
    expect(result.delivered).toEqual([40]);
    expect(fixture.calls.filter((c) => c.options.name === "repair-and-verify")).toHaveLength(1);
    expect(fixture.lastPrBody).toContain("## Summary");
    expect(fixture.lastPrBody).toContain("Closes #40");
    expect(fixture.lastPrBody).toContain("Closes #41");
    expect(fixture.lastPrBody).toContain("## Integrated Tickets");
    expect(fixture.ghLog.some((args) => args[0] === "pr" && args[1] === "create" && args.includes("--draft"))).toBe(
      true,
    );
  });
});

test("idempotent delivery recovery handles crashes after push, after PR creation, and after ticket untagging", async () => {
  // 1. Crash after git push (before PR creation).
  await withFixture(async (fixture) => {
    fixture.beforeGh = async (args) => {
      if (args[0] === "pr" && args[1] === "create") throw new Error("GitHub 502 during pr create");
    };
    const first = await fixture.run();
    expect(first.paused).toEqual([40]);
    expect(await fixture.remoteBranchHead()).toBe(await fixture.git("rev-parse", specBranch));
    expect(fixture.prCreateCount).toBe(0);

    fixture.issues.get(40)?.labels.delete("needs-attention");
    fixture.beforeGh = undefined;
    fixture.calls.length = 0;

    const second = await fixture.run();
    expect(second.delivered).toEqual([40]);
    // Ticket not re-run, review cache hit, only repair ran, push idempotent, PR created once.
    expect(fixture.calls.map((c) => c.options.name)).toEqual(["repair-and-verify"]);
    expect(fixture.prCreateCount).toBe(1);
    expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(false);
    expect(fixture.issues.get(41)?.labels.has("ready-for-agent")).toBe(false);
  });

  // 2. Crash after PR creation (before untagging tickets).
  await withFixture(
    async (fixture) => {
      fixture.beforeGh = async (args) => {
        if (args[0] === "issue" && args[1] === "edit" && args[2] === "41" && args.includes("--remove-label")) {
          throw new Error("Transient error untagging ticket #41");
        }
      };
      const first = await fixture.run();
      expect(first.paused).toEqual([40]);
      expect(fixture.prCreateCount).toBe(1);
      expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(true);
      expect(fixture.issues.get(41)?.labels.has("ready-for-agent")).toBe(true);
      expect(fixture.issues.get(42)?.labels.has("ready-for-agent")).toBe(true);

      fixture.issues.get(40)?.labels.delete("needs-attention");
      fixture.beforeGh = undefined;
      fixture.calls.length = 0;

      const second = await fixture.run();
      expect(second.delivered).toEqual([40]);
      // Fast-path matched existing Open PR: ZERO agent calls, ZERO new PRs!
      expect(fixture.calls).toHaveLength(0);
      expect(fixture.prCreateCount).toBe(1);
      expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(false);
      expect(fixture.issues.get(41)?.labels.has("ready-for-agent")).toBe(false);
      expect(fixture.issues.get(42)?.labels.has("ready-for-agent")).toBe(false);
      expect(await fixture.git("worktree", "list", "--porcelain")).not.toContain(".sandcastle/worktrees/");
      expect(await fixture.git("branch", "--list", "sandcastle/*")).toBe("");
    },
    [41, 42],
  );

  // 3. Crash after untagging tickets and cleaning up worktrees/branches (right before untagging Spec #40).
  await withFixture(
    async (fixture) => {
      fixture.beforeGh = async (args) => {
        if (args[0] === "issue" && args[1] === "edit" && args[2] === "40" && args.includes("--remove-label")) {
          throw new Error("Transient error untagging Spec #40");
        }
      };
      const first = await fixture.run();
      expect(first.paused).toEqual([40]);
      expect(fixture.issues.get(41)?.labels.has("ready-for-agent")).toBe(false);
      expect(fixture.issues.get(42)?.labels.has("ready-for-agent")).toBe(false);
      expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(true);
      // Worktrees and ticket branches were already cleaned up before Spec untag failed.
      expect(await fixture.git("worktree", "list", "--porcelain")).not.toContain(".sandcastle/worktrees/");
      expect(await fixture.git("branch", "--list", "sandcastle/*")).toBe("");

      fixture.issues.get(40)?.labels.delete("needs-attention");
      fixture.beforeGh = undefined;
      fixture.calls.length = 0;
      fixture.ghLog.length = 0;

      const second = await fixture.run();
      expect(second.delivered).toEqual([40]);
      expect(fixture.calls).toHaveLength(0);
      expect(fixture.prCreateCount).toBe(1);
      // Already-untagged tickets must NOT get redundant --remove-label edits.
      const removeLabelEdits = fixture.ghLog.filter(
        (args) => args[0] === "issue" && args[1] === "edit" && args.includes("--remove-label"),
      );
      expect(removeLabelEdits.map((args) => args[2])).toEqual(["40"]);
      expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(false);
      // Local spec branch ref is still preserved.
      expect(fixture.pr?.headRefOid).toBe(await fixture.git("rev-parse", specBranch));
    },
    [41, 42],
  );
});

test("soft-stop halts dispatching next ticket when Spec labels change without adding needs-attention", async () => {
  await withFixture(
    async (fixture) => {
      fixture.issues.get(42)?.blockers.push({ number: 41, state: "OPEN" });
      fixture.onAgent = async ({ options }) => {
        if (options.name === "implement") {
          // Maintainer removes ready-for-agent from Spec #40 mid-run.
          fixture.issues.get(40)?.labels.delete("ready-for-agent");
        }
        return undefined;
      };

      const result = await fixture.run({ maxParallel: 1 });
      expect(result.integrated).toEqual([41]);
      expect(result.stopped).toEqual([40]);
      expect(result.paused).toEqual([]);
      expect(result.delivered).toEqual([]);
      expect(fixture.calls.map((c) => c.options.name)).toEqual(["implement"]);
      expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(false);
      expect(fixture.prCreateCount).toBe(0);
    },
    [41, 42],
  );
});

test("adding a new sub-issue to the Spec mid-run does not pause or abort the Spec", async () => {
  await withFixture(
    async (fixture) => {
      fixture.issues.get(42)?.blockers.push({ number: 41, state: "OPEN" });
      fixture.onAgent = async ({ options }) => {
        if (options.name === "implement" && options.branchStrategy?.type === "branch") {
          if (options.branchStrategy.branch === "sandcastle/ticket-41") {
            // Maintainer adds a new draft sub-issue #43 mid-run.
            fixture.issues.set(43, {
              number: 43,
              title: "Draft follow-up ticket 43",
              body: "Added mid-run",
              state: "OPEN",
              labels: new Set(["type:ticket"]),
              comments: [],
              blockers: [],
              parent: 40,
            });
            fixture.issues.get(40)?.subIssues?.push(43);
          }
        }
        return undefined;
      };

      const result = await fixture.run({ maxParallel: 1 });
      expect(result.delivered).toEqual([40]);
      expect(result.paused).toEqual([]);
      expect(result.integrated).toEqual([41, 42]);
      expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(false);
    },
    [41, 42],
  );
});

test("branch conflict check pauses only ready-for-agent conflicting Specs, and dual-tier labels pause Spec with needs-attention", async () => {
  // Branch conflict: #30 (no ready-for-agent) shares branch -> ignored; #40 and #50 (both ready-for-agent) -> both paused.
  await withFixture(async (fixture) => {
    fixture.issues.set(30, {
      number: 30,
      title: "Historical Spec 30",
      body: `Integration branch: ${specBranch}`,
      state: "OPEN",
      labels: new Set(["type:spec"]),
      comments: [],
      blockers: [],
      subIssues: [],
    });
    fixture.issues.set(50, {
      number: 50,
      title: "Conflicting Spec 50",
      body: `集成分支：${specBranch}`,
      state: "OPEN",
      labels: new Set(["type:spec", "ready-for-agent"]),
      comments: [],
      blockers: [],
      subIssues: [51],
    });
    fixture.issues.set(51, {
      number: 51,
      title: "Ticket 51",
      body: "",
      state: "OPEN",
      labels: new Set(["type:ticket", "ready-for-agent"]),
      comments: [],
      blockers: [],
      parent: 50,
    });

    const result = await fixture.run();
    expect(result.exhausted).toBe(true);
    expect(result.paused.toSorted()).toEqual([40, 50]);
    expect(fixture.issues.get(30)?.labels.has("needs-attention")).toBe(false);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(50)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.calls).toHaveLength(0);
  });

  // Dual-tier conflict: ticket has both agent:light and agent:deep -> pauses Spec without running agent.
  await withFixture(async (fixture) => {
    fixture.issues.get(41)?.labels.add("agent:light");
    fixture.issues.get(41)?.labels.add("agent:deep");

    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.delivered).toEqual([]);
    expect(fixture.calls).toHaveLength(0);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toMatch(/agent:light.*agent:deep/);
  });
});

test("intercepts trust boundary violations (rewritten baseline, moved specBranch, moved remote ref)", async () => {
  // Violation 1: Ticket branch rewrote history and no longer contains dispatch baseline.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        await command("git", ["checkout", "--orphan", "temp-orphan"], worktreePath);
        await commit(worktreePath, "orphan.txt", "rewrote history\n");
        await command("git", ["branch", "-f", "sandcastle/ticket-41", "HEAD"], worktreePath);
        await command("git", ["checkout", "sandcastle/ticket-41"], worktreePath);
        return makeResult(`Done.\n${complete}`);
      }
      return undefined;
    };

    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.failed).toEqual([41]);
    expect(result.integrated).toEqual([]);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain("Trust boundary violation");
  });

  // Violation 2: Agent mutated specBranch tip during implement.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        const newSha = await commit(worktreePath, "ok.txt", "ticket work\n");
        await fixture.git("update-ref", `refs/heads/${specBranch}`, newSha);
        return makeResult(`Done.\n${complete}`);
      }
      return undefined;
    };

    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.failed).toEqual([41]);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain(specBranch);
  });

  // Violation 3: Agent rewrote remote tracking ref refs/remotes/origin/main non-fast-forward.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        await commit(worktreePath, "ok.txt", "ticket work\n");
        await command("git", ["checkout", "--orphan", "bad-remote-tip"], worktreePath);
        const unrelatedSha = await commit(worktreePath, "unrelated.txt", "unrelated\n");
        await command("git", ["checkout", "sandcastle/ticket-41"], worktreePath);
        await fixture.git("update-ref", "refs/remotes/origin/main", unrelatedSha);
        return makeResult(`Done.\n${complete}`);
      }
      return undefined;
    };

    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.failed).toEqual([41]);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain("refs/remotes/origin/main");
  });

  // Legitimate concurrent `git fetch origin main` fast-forward must NOT trip the trust boundary.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        const extra = await commit(worktreePath, "ok.txt", "ticket work\n");
        // Fast-forward refs/remotes/origin/main as if maintainer/IDE fetched an updated main mid-run.
        await fixture.git("update-ref", "refs/remotes/origin/main", extra);
        return makeResult(`Done.\n${complete}`);
      }
      return undefined;
    };
    const result = await fixture.run();
    expect(result.delivered).toEqual([40]);
    expect(result.paused).toEqual([]);
  });

  // Dirty/preserved ticket worktree must fail the ticket rather than merging partial commits.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        await commit(worktreePath, "ok.txt", "committed part\n");
        return {
          ...makeResult(`Done.\n${complete}`),
          preservedWorktreePath: worktreePath,
        };
      }
      return undefined;
    };
    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.failed).toEqual([41]);
    expect(result.integrated).toEqual([]);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain("preserved worktree");
  });

  // Newly added ready-for-agent sub-issue mid-run is integrated before review and included in PR Closes.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options }) => {
      if (options.name === "implement" && options.branchStrategy?.type === "branch") {
        if (options.branchStrategy.branch === "sandcastle/ticket-41") {
          fixture.issues.set(43, {
            number: 43,
            title: "Approved mid-run ticket 43",
            body: "Must be integrated before review",
            state: "OPEN",
            labels: new Set(["type:ticket", "ready-for-agent"]),
            comments: [],
            blockers: [],
            parent: 40,
          });
          fixture.issues.get(40)?.subIssues?.push(43);
        }
      }
      return undefined;
    };
    const result = await fixture.run({ maxParallel: 1 });
    expect(result.delivered).toEqual([40]);
    expect(result.integrated).toEqual([41, 43]);
    expect(fixture.lastPrBody).toContain("Closes #43");
  });

  // External worktree checking out an integrated ticket branch must block cleanup before deleteBranchCas.
  await withFixture(async (fixture) => {
    const extPath = join(fixture.cwd, "..", "external-t41");
    fixture.onAgent = async ({ options }) => {
      if (options.name === "repair-and-verify") {
        // Maintainer checks out sandcastle/ticket-41 in an external worktree before delivery cleanup.
        await fixture.git("worktree", "add", extPath, "sandcastle/ticket-41");
      }
      return undefined;
    };
    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.delivered).toEqual([]);
    expect(fixture.issues.get(40)?.labels.has("ready-for-agent")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain("external or locked worktree");
    expect(await fixture.git("for-each-ref", "--format=%(objectname)", "refs/heads/sandcastle/ticket-41")).not.toBe("");
    await fixture.git("worktree", "remove", "--force", extPath);
  });

  // Spec worktree containing force-committed forbidden .sandcastle/.env is rejected before review starts.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "implement") {
        await mkdir(join(worktreePath, ".sandcastle"), { recursive: true });
        await writeFile(join(worktreePath, ".sandcastle", ".env"), "GH_TOKEN=\n");
        await command("git", ["add", "-f", "--", ".sandcastle/.env"], worktreePath);
        await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", "inject dotenv"], worktreePath);
        return makeResult(`Done.\n${complete}`);
      }
      return undefined;
    };
    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.delivered).toEqual([]);
    expect(fixture.calls.some((c) => c.options.name === "review-standards")).toBe(false);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain("GH_TOKEN");
  });

  // Violation 4: Read-only review mutates Spec worktree tip -> rejected before caching or repair.
  await withFixture(async (fixture) => {
    fixture.onAgent = async ({ options, worktreePath }) => {
      if (options.name === "review-standards") {
        await commit(worktreePath, "illegal-review-edit.txt", "review mutated spec\n");
        return makeResult(`Tampered.\n${complete}`);
      }
      return undefined;
    };

    const result = await fixture.run();
    expect(result.paused).toEqual([40]);
    expect(result.delivered).toEqual([]);
    expect(fixture.calls.some((c) => c.options.name === "repair-and-verify")).toBe(false);
    expect(fixture.issues.get(40)?.labels.has("needs-attention")).toBe(true);
    expect(fixture.issues.get(40)?.comments.at(-1)?.body).toContain(specBranch);
  });
});

test("checkAfk validates repo, rejects forbidden .sandcastle/.env and .git/config credentials, and verifies remote + gh access", async () => {
  await withFixture(async (fixture) => {
    // Success on clean repo with dirty non-main checkout.
    await fixture.git("checkout", "-b", "interactive/check");
    await writeFile(join(fixture.cwd, "shared.txt"), "dirty\n");
    const ok = await checkAfk({ repo, cwd: fixture.cwd }, { runGh: fixture.runGh });
    expect(ok).toMatchObject({
      repo,
      remote: "origin",
      baseBranch: "main",
      remoteRef: "refs/remotes/origin/main",
      baseSha: fixture.baseSha,
    });
    expect(fixture.ghLog).toContainEqual(["pr", "list", "--repo", repo, "--limit", "1", "--json", "number"]);

    // Invalid repository format rejected.
    const badRepo = await expectReject(() =>
      checkAfk({ repo: "not-a-repo", cwd: fixture.cwd }, { runGh: fixture.runGh }),
    );
    expect(badRepo.message).toContain("Invalid GitHub repository");

    // Empty GH_TOKEN= in .sandcastle/.env must be rejected before calling gh.
    fixture.ghLog.length = 0;
    await mkdir(join(fixture.cwd, ".sandcastle"), { recursive: true });
    await writeFile(join(fixture.cwd, ".sandcastle", ".env"), "CODEX_AUTH=chatgpt\nGH_TOKEN=\n");
    const envErr = await expectReject(() => checkAfk({ repo, cwd: fixture.cwd }, { runGh: fixture.runGh }));
    expect(envErr.message).toContain("GH_TOKEN");
    expect(fixture.ghLog).toHaveLength(0);

    // Remove bad .env, inject credentials into .git/config remote URL -> rejected before calling gh.
    await rm(join(fixture.cwd, ".sandcastle", ".env"));
    await fixture.git("remote", "add", "leaky", "https://token@github.com/fixture/engine.git");
    const gitCredErr = await expectReject(() => checkAfk({ repo, cwd: fixture.cwd }, { runGh: fixture.runGh }));
    expect(gitCredErr.message.toLowerCase()).toContain("credential");
    expect(fixture.ghLog).toHaveLength(0);
  });
});
