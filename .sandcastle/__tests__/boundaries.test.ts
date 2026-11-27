import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { type AgentProvider, createBindMountSandboxProvider, type MountConfig } from "@ai-hero/sandcastle";
import { type AfkOptions, extractTag, hasStandaloneCompletion, runAfk } from "../afk.ts";
import {
  branchExists,
  type ExecFn,
  parseGitHubRepoUrl,
  preflightCredentials,
  runCommand,
  verifyGitRemote,
  verifyMergeCommit,
} from "../git.ts";
import { createGitHubClient, ensureClosesLines, findBlockingOpenTickets, resolveSpecBranch } from "../github.ts";
import { parsePositiveInt } from "../run.mts";
import { createRepoSessionFactory, stageCodexAuth } from "../session.ts";

const PROMPTS_DIR = resolve(import.meta.dirname, "..", "prompts");
const REPO = "cyy1998/shgas-iam";
const COMPLETE = "<promise>COMPLETE</promise>";
const tempDirs: string[] = [];

const page = <T>(nodes: T[], hasNextPage = false) => ({ pageInfo: { hasNextPage }, nodes });
const labelPage = (names: string[]) => page(names.map((name) => ({ name })));
const prEntry = (number: number, headRefName: string, body: string, headRefOid: string) => ({
  number,
  url: `https://github.com/${REPO}/pull/${number}`,
  body,
  state: "OPEN" as const,
  isDraft: false,
  isCrossRepository: false,
  headRefName,
  headRefOid,
  baseRefName: "main",
});
const specGraphql = (
  number: number,
  opts: { branches?: string[]; branchOverflow?: boolean; subIssues?: unknown[]; labels?: string[] } = {},
) =>
  JSON.stringify({
    data: {
      repository: {
        issue: {
          number,
          title: `Spec ${number}`,
          body: "Spec body",
          state: "OPEN",
          labels: labelPage(opts.labels ?? ["type:spec", "ready-for-agent"]),
          comments: page([]),
          linkedBranches: page(
            (opts.branches ?? []).map((name) => ({ ref: { name } })),
            Boolean(opts.branchOverflow),
          ),
          subIssues: page(opts.subIssues ?? []),
        },
      },
    },
  });
const noopSandbox = { copyFileIn: async () => {}, copyFileOut: async () => {}, close: async () => {} };
const gitNoHooks = (dir: string, ...args: string[]) =>
  runCommand("git", ["-c", "core.hooksPath=/dev/null", ...args], dir);

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function captureError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

async function commitFile(dir: string, filename: string, content: string, message: string): Promise<string> {
  await writeFile(join(dir, filename), content);
  await gitNoHooks(dir, "add", filename);
  await gitNoHooks(dir, "commit", "-q", "-m", message);
  return gitNoHooks(dir, "rev-parse", "HEAD");
}

afterEach(async () => {
  for (let dir = tempDirs.pop(); dir !== undefined; dir = tempDirs.pop())
    await rm(dir, { recursive: true, force: true });
});

describe("GitHub issue filtering, pagination overflow, linkedBranches, and PR reuse", () => {
  test("lists only ready-for-agent specs without needs-attention and rejects pagination overflow", async () => {
    const readyLabels = [{ name: "type:spec" }, { name: "ready-for-agent" }];
    const client = createGitHubClient({
      repo: REPO,
      cwd: process.cwd(),
      execFn: async (_file, args) => {
        expect(args).toEqual([
          "issue",
          "list",
          "--repo",
          REPO,
          "--state",
          "open",
          "--label",
          "type:spec",
          "--label",
          "ready-for-agent",
          "--limit",
          "100",
          "--json",
          "number,labels",
        ]);
        return JSON.stringify([
          { number: 440, labels: readyLabels },
          { number: 433, labels: readyLabels },
          { number: 430, labels: [...readyLabels, { name: "needs-attention" }] },
          { number: 431, labels: [...readyLabels, { name: "type:ticket" }] },
        ]);
      },
    });
    const nums = await client.listReadySpecNumbers();
    expect(nums).toEqual([433, 440]);

    const fullPage = createGitHubClient({
      repo: REPO,
      cwd: process.cwd(),
      execFn: async () => JSON.stringify(Array.from({ length: 100 }, (_, number) => ({ number, labels: readyLabels }))),
    });
    const overflow = await captureError(() => fullPage.listReadySpecNumbers());
    expect(overflow?.message).toContain("分页溢出");
  });

  test("resolves Spec branch from linkedBranches, rejects invalid branches, and reuses same-repo Open PR", async () => {
    const load = (branches: string[], branchOverflow = false) =>
      createGitHubClient({
        repo: REPO,
        cwd: process.cwd(),
        execFn: async () => specGraphql(450, { branches, branchOverflow }),
      }).readSpec(450);
    const defaultSpec = await load([]);
    expect(resolveSpecBranch(defaultSpec, "main")).toBe("sandcastle/spec-450");
    expect(resolveSpecBranch(await load(["feat/user-sync"]), "main")).toBe("feat/user-sync");
    const [mainSpec, multiSpec] = [await load(["main"]), await load(["feat/a", "feat/b"])];
    expect(() => resolveSpecBranch(mainSpec, "release/v1")).toThrow("不得为 main");
    expect(() => resolveSpecBranch(multiSpec, "main")).toThrow("关联了多个分支");
    expect((await captureError(() => load(["feat/a"], true)))?.message).toContain("分页溢出");

    const mkTicket = (number: number, title: string, labels: string[]) => ({
      number,
      title,
      body: "",
      state: "OPEN" as const,
      labels,
      comments: [],
      blockedBy: [],
    });
    const partialSpec = {
      ...defaultSpec,
      subIssues: [
        mkTicket(451, "A", ["type:ticket", "ready-for-agent"]),
        mkTicket(452, "B", ["type:ticket", "needs-attention"]),
      ],
    };
    expect(findBlockingOpenTickets(partialSpec, new Map([[451, "deadbeef"]])).map((t) => t.number)).toEqual([452]);

    const calls: string[][] = [];
    const pr = prEntry(99, "feat/user-sync", "Existing\n\nCloses #450\n", "a".repeat(40));
    const client = createGitHubClient({
      repo: REPO,
      cwd: process.cwd(),
      execFn: async (_f, args) => {
        calls.push(args);
        if (args[1] === "list") {
          return JSON.stringify([
            { ...pr, number: 96, isCrossRepository: true },
            { ...pr, number: 97, baseRefName: "release" },
            { ...pr, number: 98, headRefName: "feat/other" },
            pr,
          ]);
        }
        if (args[1] === "edit") pr.body = args[args.indexOf("--body") + 1] ?? "";
        return "";
      },
    });
    const delivery = {
      specBranch: "feat/user-sync",
      baseBranch: "main",
      title: "Demo",
      body: "New body",
      closeNums: [450, 451],
      draft: true,
    };
    const prUrl = await client.upsertPullRequest(delivery);
    const reusedPrUrl = await client.upsertPullRequest(delivery);
    expect(reusedPrUrl).toBe(prUrl);
    expect(pr.body).toBe("Existing\n\nCloses #450\n\nCloses #451\n");
    expect(prUrl).toBe(`https://github.com/${REPO}/pull/99`);
    expect(calls.filter((a) => a[1] === "edit" && a.includes("99"))).toHaveLength(1);
    expect(calls.some((a) => a[1] === "create")).toBe(false);
  });
});

describe("Credential preflight, remote URLs, Git refs/merges, completion/tag extraction, and CLI args", () => {
  test("rejects GH_TOKEN/GITHUB_TOKEN in root or worktree .sandcastle/.env and .git/config auth", async () => {
    const [root, wt] = [await makeTempDir("afk-creds-root-"), await makeTempDir("afk-creds-wt-")];
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");
    await preflightCredentials(root, [wt]);
    await mkdir(join(wt, ".sandcastle"), { recursive: true });
    await writeFile(join(wt, ".sandcastle", ".env"), 'NOTE="line1\nGH_TOKEN=\nline2"\n');
    expect((await captureError(() => preflightCredentials(root, [wt])))?.message).toContain("GH_TOKEN");
    await rm(join(wt, ".sandcastle", ".env"));
    await writeFile(join(root, ".git", "config"), "[http]\n\textraHeader = AUTHORIZATION: basic abc\n");
    expect((await captureError(() => preflightCredentials(root, [wt])))?.message).toContain("Authorization");
  });

  test("validates both push and fetch remote URLs against github.com/<repo>", async () => {
    expect(parseGitHubRepoUrl("git@github.com:cyy1998/shgas-iam.git")).toBe(REPO);
    expect(parseGitHubRepoUrl("https://github.com/cyy1998/shgas-iam")).toBe(REPO);
    expect(parseGitHubRepoUrl("https://evil.example.com/cyy1998/shgas-iam.git")).toBeUndefined();
    await verifyGitRemote(
      process.cwd(),
      "origin",
      REPO,
      async () => "git@github.com:cyy1998/shgas-iam.git\nhttps://github.com/cyy1998/shgas-iam.git",
    );
    const badFetch = await captureError(() =>
      verifyGitRemote(process.cwd(), "origin", REPO, async (_f, args) =>
        args.includes("--push")
          ? "git@github.com:cyy1998/shgas-iam.git"
          : "https://evil.example.com/cyy1998/shgas-iam.git",
      ),
    );
    expect(badFetch?.message).toContain("fetch URL");
  });

  test("supports exact branchExists, extractTag last-match, completion/Closes/CLI helpers, and relaxed verifyMergeCommit", async () => {
    const repo = await makeTempDir("afk-git-ref-");
    for (const args of [
      ["init", "-q"],
      ["config", "user.name", "Test"],
      ["config", "user.email", "test@example.invalid"],
    ])
      await gitNoHooks(repo, ...args);
    await commitFile(repo, "README.md", "base\n", "init");
    await gitNoHooks(repo, "branch", "feat/foo/bar");
    expect(await branchExists(repo, "feat/foo/bar")).toBe(true);
    expect(await branchExists(repo, "feat/foo")).toBe(false);

    const specTipBefore = await gitNoHooks(repo, "rev-parse", "HEAD");
    await gitNoHooks(repo, "checkout", "-q", "-b", "ticket-7");
    const ticketTip = await commitFile(repo, "ticket.txt", "ticket change\n", "ticket #7");
    await gitNoHooks(repo, "checkout", "-q", "-");
    await gitNoHooks(repo, "merge", "--no-ff", "-m", "Merge #7: demo\n\nSandcastle-Ticket: #7", ticketTip);
    const expectedMergeSha = await gitNoHooks(repo, "rev-parse", "HEAD");
    await commitFile(repo, "ticket.txt", "ticket change + lint fix\n", "chore: follow-up fix after merge");
    expect(await verifyMergeCommit(repo, specTipBefore, ticketTip, 7)).toBe(expectedMergeSha);

    const specTipBefore2 = await gitNoHooks(repo, "rev-parse", "HEAD");
    await gitNoHooks(repo, "checkout", "-q", "-b", "ticket-8");
    const ticket8Tip = await commitFile(repo, "ticket8.txt", "ticket 8\n", "ticket #8");
    await gitNoHooks(repo, "checkout", "-q", "-");
    await gitNoHooks(repo, "merge", "--no-ff", "-m", "Merge #8 without trailer", ticket8Tip);
    await commitFile(repo, "ticket8.txt", "ticket 8 follow-up\n", "fixup after merge #8");
    expect((await captureError(() => verifyMergeCommit(repo, specTipBefore2, ticket8Tip, 8)))?.message).toContain(
      "Sandcastle-Ticket: #8",
    );

    expect(
      extractTag("说明：<pr-body>占位</pr-body>\n\n<pr-body>\n## Summary\n\n真实 PR 正文\n</pr-body>\n", "pr-body"),
    ).toBe("## Summary\n\n真实 PR 正文");
    expect(hasStandaloneCompletion("done\n<promise>COMPLETE</promise>\n")).toBe(true);
    expect(hasStandaloneCompletion("failed: did not emit <promise>COMPLETE</promise>")).toBe(false);
    expect(ensureClosesLines("Summary\n\nCloses #433\n", [433, 434])).toContain("Closes #434");
    expect(parsePositiveInt("--parallel", "4")).toBe(4);
    for (const [f, v] of [
      ["--parallel", "0"],
      ["--parallel", "abc"],
      ["--iterations", "-1"],
      ["--spec", ""],
    ] as const)
      expect(() => parsePositiveInt(f, v)).toThrow("正整数");
  });
});

describe("Plan X unprivileged session isolation and one-way auth staging", () => {
  test("creates readonly and writable sessions with zero docker.sock/network:host/groups and dedicated test endpoints", async () => {
    const [root, wt] = [await makeTempDir("afk-session-"), await makeTempDir("afk-session-wt-")];
    const [authFile, original] = [join(root, "auth.json"), '{"token":"secret"}\n'];
    await writeFile(authFile, original, { mode: 0o600 });

    const staged = await stageCodexAuth(root, { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile });
    expect(staged.mounts).toHaveLength(1);
    expect(staged.mounts[0]?.readonly).toBe(true);
    expect(staged.mounts[0]?.hostPath).not.toBe(authFile);
    await staged.close();
    expect(await readFile(authFile, "utf8")).toBe(original);

    type Opts = {
      imageName?: string;
      mounts?: readonly MountConfig[];
      env?: Record<string, string>;
      groups?: readonly (string | number)[];
      network?: string | readonly string[];
    };
    const providerCalls: Opts[] = [];
    const createCalls: { mounts: MountConfig[]; env: Record<string, string> }[] = [];
    const fakeDocker = ((opts?: Opts) => {
      providerCalls.push({ ...opts });
      return createBindMountSandboxProvider({
        name: "fake-docker",
        create: async (c) => {
          createCalls.push({ mounts: [...c.mounts], env: { ...c.env } });
          return {
            sandboxId: "sb",
            worktreePath: c.worktreePath,
            exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
            ...noopSandbox,
          };
        },
      });
    }) as unknown as typeof import("@ai-hero/sandcastle/sandboxes/docker").docker;

    const factory = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile },
      imageName: "iam-sandcastle:local",
      hostStore: join(root, "pnpm-store"),
      turboCacheDir: join(root, "turbo-cache"),
      createDockerProvider: fakeDocker,
    });

    const ro = await factory({ readonly: true });
    expect(ro.hooks).toBeUndefined();
    expect(providerCalls[0]?.groups).toBeUndefined();
    expect(providerCalls[0]?.network).toBeUndefined();
    expect(providerCalls[0]?.env).toEqual({ CODEX_HOME: "/home/agent/.codex" });
    expect(providerCalls[0]?.mounts?.every((m) => m.readonly === true)).toBe(true);
    expect(
      providerCalls[0]?.mounts?.some((m) =>
        /(?:docker\.sock|pnpm-store|turbo-cache|\.docker\/config\.json)/.test(m.sandboxPath),
      ),
    ).toBe(false);
    await (ro.sandbox as unknown as { create: (o: unknown) => Promise<unknown> }).create({
      worktreePath: wt,
      hostRepoPath: root,
      env: {},
      mounts: [
        { hostPath: wt, sandboxPath: "/home/agent/workspace" },
        { hostPath: join(root, ".git"), sandboxPath: "/home/agent/.git", readonly: false },
      ],
    });
    expect(createCalls[0]?.mounts).toHaveLength(2);
    expect(createCalls[0]?.mounts.every((m) => m.readonly === true)).toBe(true);
    await ro.cleanup?.();

    const rw = await factory({ readonly: false });
    expect(rw.hooks?.sandbox?.onSandboxReady?.[1]?.command).toBe("bash .sandcastle/start-test-infra.sh");
    expect(rw.hooks?.sandbox?.onSandboxReady?.[0]?.command).toContain(
      "pnpm install --frozen-lockfile --prefer-offline",
    );
    const rwCall = providerCalls[1];
    expect(rwCall?.imageName).toBe("iam-sandcastle:local");
    expect(rwCall?.groups).toBeUndefined();
    expect(rwCall?.network).toBeUndefined();
    expect(rwCall?.mounts?.map((m) => m.sandboxPath)).toEqual([
      "/home/agent/.pnpm-store",
      "/home/agent/.turbo-cache",
      "/home/agent/.codex/auth.json",
    ]);
    expect(rwCall?.mounts?.[2]?.readonly).toBe(true);
    expect(rwCall?.mounts?.some((m) => m.sandboxPath.includes("docker.sock"))).toBe(false);
    expect(rwCall?.env).toEqual({
      CODEX_HOME: "/home/agent/.codex",
      IAM_TEST_POSTGRES_URL: "postgresql://iam_test:iam_test@127.0.0.1:55432/iam_test",
      IAM_TEST_REDIS_URL: "redis://127.0.0.1:56379/0",
      IAM_TEST_APISIX_ADMIN_URL: "http://127.0.0.1:59180/apisix/admin",
      IAM_TEST_APISIX_ADMIN_KEY: "iam-gateway-integration-admin-key",
      TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: ".husky",
    });
    expect(rwCall?.env?.DOCKER_HOST).toBeUndefined();

    const stagedAuthPath = rwCall?.mounts?.[2]?.hostPath;
    expect(stagedAuthPath && existsSync(stagedAuthPath)).toBe(true);
    await rw.cleanup?.();
    expect(stagedAuthPath && existsSync(stagedAuthPath)).toBe(false);
  });
});

const SPEC_NUMBER = 10;
const SPEC_BRANCH = `sandcastle/spec-${SPEC_NUMBER}`;
const READY_SPEC = ["type:spec", "ready-for-agent"];
type TicketPhase = { worktree: string; number: number };

function rawTicket(number: number, blockers: number[] = []) {
  return {
    number,
    title: `Ticket ${number}`,
    body: "Ticket body",
    state: "OPEN",
    labels: labelPage(["type:ticket", "ready-for-agent"]),
    comments: page([]),
    blockedBy: page(blockers.map((number) => ({ number, state: "OPEN" }))),
  };
}

async function setupDelivery(config: {
  tickets: ReturnType<typeof rawTicket>[];
  maxParallel?: number;
  draft?: boolean;
  implement?: (phase: TicketPhase) => Promise<string | undefined>;
  merge?: (worktree: string, prompt: string) => Promise<void>;
  repair?: (worktree: string) => Promise<void>;
}) {
  const root = await makeTempDir("afk-delivery-");
  const [remote, cwd] = [join(root, "remote.git"), join(root, "repo")];
  await mkdir(remote);
  await mkdir(cwd);
  await gitNoHooks(remote, "init", "--bare", "-q", "-b", "main");
  await gitNoHooks(cwd, "init", "-q", "-b", "main");
  await gitNoHooks(cwd, "config", "user.name", "Sandcastle Test");
  await gitNoHooks(cwd, "config", "user.email", "test@example.invalid");
  await gitNoHooks(cwd, "remote", "add", "origin", remote);
  const baseSha = await commitFile(cwd, "README.md", "base\n", "init main");
  await gitNoHooks(cwd, "push", "-q", "origin", "main");

  const state = {
    labels: READY_SPEC,
    prs: [] as (Omit<ReturnType<typeof prEntry>, "state"> & { state: string })[],
  };
  const specWorktree = join(cwd, ".sandcastle", "worktrees", `spec-${SPEC_NUMBER}`);
  const ghCalls: string[][] = [];
  const phases: { worktree: string; readonly: boolean; prompt: string }[] = [];
  const removedLabels: { number: number; specWorktreePresent: boolean }[] = [];
  const remoteHead = () => gitNoHooks(remote, "rev-parse", "--verify", "--quiet", `refs/heads/${SPEC_BRANCH}`);
  const prUrl = `https://github.com/${REPO}/pull/${SPEC_NUMBER}`;
  const ghExec: ExecFn = async (_file, args) => {
    ghCalls.push(args);
    const [cmd, sub, ref] = args;
    if (cmd === "api" && sub === "graphql") {
      return specGraphql(SPEC_NUMBER, { labels: state.labels, subIssues: config.tickets });
    }
    if (cmd === "issue" && sub === "view") {
      expect(args).toEqual(["issue", "view", String(SPEC_NUMBER), "--repo", REPO, "--json", "state,labels"]);
      return JSON.stringify({ state: "OPEN", labels: state.labels.map((name) => ({ name })) });
    }
    if (cmd === "issue" && sub === "edit") {
      if (args.includes("--remove-label")) {
        removedLabels.push({ number: Number(ref), specWorktreePresent: existsSync(specWorktree) });
      }
      return "";
    }
    if (cmd === "issue" && sub === "comment") return "";
    if (cmd === "pr" && sub === "list") return JSON.stringify(state.prs);
    if (cmd === "pr" && sub === "create") {
      expect(await remoteHead()).toBe(await gitNoHooks(cwd, "rev-parse", SPEC_BRANCH));
      return prUrl;
    }
    if (cmd === "pr" && sub === "edit") return "";
    throw new Error(`Unexpected gh call: ${args.join(" ")}`);
  };

  const prefix = "MOCK_PROMPT:";
  const agent: AgentProvider = {
    name: "mock-agent",
    env: {},
    captureSessions: false,
    parseStreamLine: (line) => [{ type: "text", text: line }],
    buildPrintCommand: ({ prompt }) => ({ command: `${prefix}${prompt}` }),
  };
  const options: AfkOptions = {
    repo: REPO,
    cwd,
    specNumber: SPEC_NUMBER,
    maxParallel: config.maxParallel,
    draft: config.draft,
    promptsDir: PROMPTS_DIR,
    ghExec,
    gitRemoteExec: async () => `https://github.com/${REPO}.git`,
    agents: { light: agent, standard: agent, deep: agent, reviewStandards: agent, reviewSpec: agent, repair: agent },
    createSession: async ({ readonly }) => ({
      sandbox: createBindMountSandboxProvider({
        name: "mock-sandbox",
        create: async ({ worktreePath: worktree }) => ({
          sandboxId: basename(worktree),
          worktreePath: worktree,
          ...noopSandbox,
          exec: async (cmd, execOpts) => {
            if (!cmd.startsWith(prefix)) {
              return {
                exitCode: 0,
                stdout: cmd.includes("rev-parse --abbrev-ref HEAD")
                  ? await gitNoHooks(worktree, "branch", "--show-current")
                  : "",
                stderr: "",
              };
            }
            const prompt = cmd.slice(prefix.length);
            phases.push({ worktree, readonly, prompt });
            let output = COMPLETE;
            if (basename(worktree).startsWith("ticket-")) {
              const number = Number(basename(worktree).slice("ticket-".length));
              const override = await config.implement?.({ number, worktree });
              if (override === undefined) {
                await commitFile(worktree, `ticket-${number}.txt`, `implementation #${number}\n`, `ticket #${number}`);
              } else {
                output = override;
              }
            } else if (prompt.includes("## Merge Context")) {
              if (!config.merge) throw new Error("Unexpected Merger dispatch");
              await config.merge(worktree, prompt);
            } else if (prompt.includes("## Dual-Axis Review Report")) {
              await config.repair?.(worktree);
              output = `<pr-body>\n## Summary\n\nAutomated PR\n</pr-body>\n${COMPLETE}`;
            }
            for (const line of output.split("\n")) execOpts?.onLine?.(line);
            return { exitCode: 0, stdout: output, stderr: "" };
          },
        }),
      }),
    }),
  };
  return {
    cwd,
    state,
    specWorktree,
    baseSha,
    remoteHead,
    ghCalls,
    phases,
    removedLabels,
    prUrl,
    run: () => runAfk(options),
  };
}

describe("AFK ticket scheduling, real Git merges, and PR delivery", () => {
  test("limits concurrency and dispatches blocked tickets only after their prerequisite is merged", async () => {
    const secondStarted = Promise.withResolvers<void>();
    const dependentStarted = Promise.withResolvers<void>();
    const dispatched: number[] = [];
    let active = 0;
    let peak = 0;
    const dispatchTrailers = new Map<number, string>();
    const scenario = await setupDelivery({
      tickets: [rawTicket(11), rawTicket(12), rawTicket(13, [11]), rawTicket(14)],
      maxParallel: 2,
      implement: async ({ number, worktree }) => {
        dispatched.push(number);
        peak = Math.max(peak, ++active);
        try {
          if (number === 11) await secondStarted.promise;
          if (number === 12) {
            secondStarted.resolve();
            await dependentStarted.promise;
          }
          if (number === 13) dependentStarted.resolve();
          if (number >= 13) {
            dispatchTrailers.set(
              number,
              await gitNoHooks(worktree, "log", "--first-parent", "--merges", "--format=%B"),
            );
          }
          await commitFile(worktree, `ticket-${number}.txt`, `implementation #${number}\n`, `ticket #${number}`);
          return COMPLETE;
        } finally {
          active -= 1;
        }
      },
    });
    const result = await scenario.run();
    expect(result.paused).toEqual([]);
    expect(result.delivered[0]?.tickets).toEqual([11, 12, 13, 14]);
    expect(dispatched.slice(0, 2).sort()).toEqual([11, 12]);
    expect(peak).toBe(2);
    expect(dispatchTrailers.get(13)).toContain("Sandcastle-Ticket: #11");
    expect(dispatchTrailers.get(14)).toContain("Sandcastle-Ticket: #11");
  });

  test("drains independent in-flight tickets before marking a Spec paused after one ticket fails", async () => {
    const secondStarted = Promise.withResolvers<void>();
    const firstFailed = Promise.withResolvers<void>();
    const scenario = await setupDelivery({
      tickets: [rawTicket(11), rawTicket(12), rawTicket(13)],
      maxParallel: 2,
      implement: async ({ number, worktree }) => {
        if (number === 11) {
          await secondStarted.promise;
          firstFailed.resolve();
          return "blocked";
        }
        if (number === 12) {
          secondStarted.resolve();
          await firstFailed.promise;
          await commitFile(worktree, "in-flight.txt", "completed\n", "ticket #12");
        }
        return COMPLETE;
      },
    });
    const result = await scenario.run();
    const merges = await gitNoHooks(scenario.specWorktree, "log", "--first-parent", "--merges", "--format=%B");
    const ticketDirs = scenario.phases.map(({ worktree }) => basename(worktree)).sort();
    expect(result.paused[0]?.reason).toContain("#11");
    expect(result.delivered).toEqual([]);
    expect(ticketDirs).toEqual(["ticket-11", "ticket-12"]);
    expect(merges).toContain("Sandcastle-Ticket: #12");
    expect(merges).not.toContain("Sandcastle-Ticket: #11");
    expect(scenario.ghCalls.some((args) => args.includes("needs-attention"))).toBe(true);
    expect(scenario.removedLabels).toEqual([]);
  });

  test("soft-stops new dispatch after the parent Spec loses ready-for-agent", async () => {
    const scenario = await setupDelivery({
      tickets: [rawTicket(11), rawTicket(12, [11])],
      maxParallel: 1,
      implement: async () => {
        scenario.state.labels = ["type:spec"];
        return undefined;
      },
    });
    const result = await scenario.run();
    const merges = await gitNoHooks(scenario.specWorktree, "log", "--first-parent", "--merges", "--format=%B");
    expect(result).toEqual({ delivered: [], paused: [], stopped: [SPEC_NUMBER] });
    expect(scenario.phases.map(({ worktree }) => basename(worktree))).toEqual(["ticket-11"]);
    expect(merges).toContain("Sandcastle-Ticket: #11");
    expect(scenario.removedLabels).toEqual([]);
    expect(scenario.ghCalls.some((args) => args[0] === "pr")).toBe(false);
  });

  test.each([false, true])("uses the same fast merge and cleanup for draft=%s", async (draft) => {
    const scenario = await setupDelivery({ tickets: [rawTicket(11)], draft });
    const result = await scenario.run();
    const sha = await gitNoHooks(scenario.cwd, "rev-parse", SPEC_BRANCH);
    const remoteSha = await scenario.remoteHead();
    const merge = await gitNoHooks(scenario.cwd, "show", "-s", "--format=%P%n%B", sha);
    expect(result).toEqual({
      delivered: [{ spec: SPEC_NUMBER, branch: SPEC_BRANCH, prUrl: scenario.prUrl, tickets: [11] }],
      stopped: [],
      paused: [],
    });
    expect(remoteSha).toBe(sha);
    expect(merge.split("\n")[0]?.split(" ")).toHaveLength(2);
    expect(merge).toContain("Sandcastle-Ticket: #11");
    expect(scenario.phases.some(({ prompt }) => prompt.includes("## Merge Context"))).toBe(false);
    const reviews = scenario.phases.filter(({ readonly }) => readonly);
    expect(reviews).toHaveLength(2);
    expect(reviews.every(({ prompt }) => prompt.includes("禁止修改文件、Git 或 GitHub 状态"))).toBe(true);
    expect(
      scenario.phases
        .filter(({ readonly }) => !readonly)
        .every(
          ({ prompt }) =>
            prompt.includes("--no-verify") && prompt.includes("pnpm test:e2e") && prompt.includes(COMPLETE),
        ),
    ).toBe(true);
    const create = scenario.ghCalls.find((args) => args[0] === "pr" && args[1] === "create");
    expect(create?.includes("--draft")).toBe(draft);
    expect(create?.at(draft ? -2 : -1)).toContain("Closes #10\nCloses #11");
    expect(scenario.removedLabels).toEqual([
      { number: 11, specWorktreePresent: true },
      { number: SPEC_NUMBER, specWorktreePresent: false },
    ]);
    expect(existsSync(scenario.specWorktree)).toBe(false);
    const ticketRef = await branchExists(scenario.cwd, "sandcastle/ticket-11");
    expect(ticketRef).toBe(false);
  });

  test.each([false, true])("aborts a real conflict before Merger and verifies its commit (merge=%s)", async (merge) => {
    const scenario = await setupDelivery({
      tickets: [rawTicket(11)],
      implement: async () => COMPLETE,
      merge: async (worktree, prompt) => {
        const status = await gitNoHooks(worktree, "status", "--porcelain");
        const mergeHead = await captureError(() => gitNoHooks(worktree, "rev-parse", "--verify", "MERGE_HEAD"));
        expect(status).toBe("");
        expect(mergeHead).toBeDefined();
        expect(prompt).toContain("Sandcastle-Ticket: #11");
        if (!merge) {
          await commitFile(worktree, "README.md", "spec and ticket\n", "plain commit");
          return;
        }
        const conflict = await captureError(() => gitNoHooks(worktree, "merge", "--no-ff", "--no-commit", ticketTip));
        expect(conflict).toBeDefined();
        await commitFile(worktree, "README.md", "spec and ticket\n", "Merge #11\n\nSandcastle-Ticket: #11");
      },
    });
    await gitNoHooks(scenario.cwd, "switch", "-c", SPEC_BRANCH);
    const specTip = await commitFile(scenario.cwd, "README.md", "spec\n", "spec change");
    await gitNoHooks(scenario.cwd, "switch", "-c", "sandcastle/ticket-11", scenario.baseSha);
    const ticketTip = await commitFile(scenario.cwd, "README.md", "ticket\n", "ticket change");
    await gitNoHooks(scenario.cwd, "switch", "main");

    const result = await scenario.run();
    expect(scenario.phases.filter(({ prompt }) => prompt.includes("## Merge Context"))).toHaveLength(1);
    if (merge) {
      const parents = await gitNoHooks(scenario.cwd, "show", "-s", "--format=%P", SPEC_BRANCH);
      expect(parents).toBe(`${specTip} ${ticketTip}`);
      expect(result.paused).toEqual([]);
      expect(result.delivered[0]?.tickets).toEqual([11]);
    } else {
      expect(result.delivered).toEqual([]);
      expect(result.paused[0]?.reason).toContain("未找到包含");
      expect(scenario.removedLabels).toEqual([]);
    }
  });

  test("pushes the repaired SHA and reuses an open PR whose head is an ancestor", async () => {
    let finalSha = "";
    const scenario = await setupDelivery({
      tickets: [rawTicket(11)],
      repair: async (worktree) => {
        finalSha = await commitFile(worktree, "review-fix.txt", "review fix\n", "review fix");
      },
    });
    await gitNoHooks(scenario.cwd, "push", "origin", `${scenario.baseSha}:refs/heads/${SPEC_BRANCH}`);
    const existing = prEntry(99, SPEC_BRANCH, "Existing PR", scenario.baseSha);
    scenario.state.prs = [existing];

    const result = await scenario.run();
    const remoteSha = await scenario.remoteHead();
    expect(result.paused).toEqual([]);
    expect(result.delivered[0]?.prUrl).toBe(existing.url);
    expect(remoteSha).toBe(finalSha);
    const prCalls = scenario.ghCalls.filter((args) => args[0] === "pr");
    expect(prCalls.map((args) => args[1])).toEqual(["list", "list", "edit"]);
    expect(prCalls.at(-1)?.at(-1)).toBe("Existing PR\n\nCloses #10\nCloses #11\n");
  });

  test.each(["diverged", "closed"])("refuses to push over an unsafe existing PR (%s)", async (kind) => {
    const scenario = await setupDelivery({ tickets: [rawTicket(11)] });
    await gitNoHooks(scenario.cwd, "push", "origin", `${scenario.baseSha}:refs/heads/${SPEC_BRANCH}`);
    await gitNoHooks(scenario.cwd, "switch", "-c", "manual");
    const humanSha = await commitFile(scenario.cwd, "human.txt", "manual\n", "manual PR update");
    await gitNoHooks(scenario.cwd, "switch", "main");
    scenario.state.prs = [
      {
        ...prEntry(99, SPEC_BRANCH, "Existing PR", kind === "diverged" ? humanSha : scenario.baseSha),
        state: kind === "closed" ? "CLOSED" : "OPEN",
      },
    ];

    const result = await scenario.run();
    const remoteSha = await scenario.remoteHead();
    expect(result.paused[0]?.reason).toContain("拒绝推送");
    expect(result.delivered).toEqual([]);
    expect(remoteSha).toBe(scenario.baseSha);
    expect(scenario.removedLabels).toEqual([]);
    expect(scenario.ghCalls.filter((args) => args[0] === "pr").map((args) => args[1])).toEqual(["list"]);
  });
});
