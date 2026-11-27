import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
import {
  type CheckRun,
  ensureClosesLines,
  fetchSanitizedCiFailureLogs,
  findBlockingOpenTickets,
  listCommitCheckRuns,
  listReadySpecNumbers,
  readSpec,
  redactSensitiveLog,
  resolveSpecBranch,
  sanitizeCiFailureLogs,
  selectLatestCiGateCheckRun,
  upsertPullRequest,
  type WorkflowRun,
} from "../github.ts";
import { parseNonNegativeInt, parsePositiveInt } from "../run.mts";
import { createRepoSessionFactory, stageCodexAuth } from "../session.ts";

const PROMPTS_DIR = resolve(import.meta.dirname, "..", "prompts");
const REPO = "cyy1998/shgas-iam";
const COMPLETE = "<promise>COMPLETE</promise>";
const tempDirs: string[] = [];

const page = <T>(nodes: T[], hasNextPage = false) => ({ pageInfo: { hasNextPage }, nodes });
const labelPage = (names: string[]) => page(names.map((name) => ({ name })));
const checkRun = (
  id: number,
  name: string,
  head_sha: string,
  status = "completed",
  conclusion: string | null = "success",
): CheckRun => ({ id, name, head_sha, status, conclusion });
const prEntry = (number: number, headRefName: string, body: string) => ({
  number,
  url: `https://github.com/${REPO}/pull/${number}`,
  body,
  state: "OPEN" as const,
  isDraft: false,
  isCrossRepository: false,
  headRefName,
  baseRefName: "main",
});
const specGraphql = (
  number: number,
  opts: { branches?: string[]; branchOverflow?: boolean; subIssues?: unknown[] } = {},
) =>
  JSON.stringify({
    data: {
      repository: {
        issue: {
          number,
          title: `Spec ${number}`,
          body: "Spec body",
          state: "OPEN",
          labels: labelPage(["type:spec", "ready-for-agent"]),
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

describe("GitHub GraphQL filtering, pagination overflow, linkedBranches, and PR reuse", () => {
  test("lists only ready-for-agent specs without needs-attention and rejects pagination overflow", async () => {
    let query = "";
    const nums = await listReadySpecNumbers(REPO, process.cwd(), async (_f, args) => {
      query = args.join(" ");
      const nodes = [
        { number: 440, labels: labelPage(["type:spec", "ready-for-agent"]) },
        { number: 433, labels: labelPage(["type:spec", "ready-for-agent"]) },
        { number: 430, labels: labelPage(["type:spec", "ready-for-agent", "needs-attention"]) },
      ];
      return JSON.stringify({ data: { repository: { issues: page(nodes) } } });
    });
    expect(query).toContain('labels:["type:spec","ready-for-agent"]');
    expect(nums).toEqual([433, 440]);
    const overflow = await captureError(() =>
      listReadySpecNumbers(REPO, process.cwd(), async () =>
        JSON.stringify({ data: { repository: { issues: page([], true) } } }),
      ),
    );
    expect(overflow?.message).toContain("分页溢出");
  });

  test("resolves Spec branch from linkedBranches, rejects invalid branches, and reuses same-repo Open PR", async () => {
    const load = (branches: string[], branchOverflow = false) =>
      readSpec(REPO, 450, process.cwd(), async () => specGraphql(450, { branches, branchOverflow }));
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
    const prUrl = await upsertPullRequest({
      repo: REPO,
      cwd: process.cwd(),
      specBranch: "feat/user-sync",
      baseBranch: "main",
      title: "Demo",
      body: "New body",
      closeNums: [450, 451],
      execFn: async (_f, args) => {
        calls.push(args);
        return args[1] === "list" ? JSON.stringify([prEntry(99, "feat/user-sync", "Existing\n\nCloses #450\n")]) : "";
      },
    });
    expect(prUrl).toBe(`https://github.com/${REPO}/pull/99`);
    expect(calls.some((a) => a[1] === "edit" && a.includes("99"))).toBe(true);
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
    expect(parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "0")).toBe(0);
    expect(parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "2")).toBe(2);
    for (const v of ["-1", "abc"])
      expect(() => parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", v)).toThrow("非负整数");
  });
});

describe("Plan X unprivileged session isolation and one-way auth staging", () => {
  test("creates readonly and writable sessions with zero docker.sock/network:host/groups and IAM_TEST_RESOURCE_PROVIDER=native", async () => {
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

    const ro = await factory({ worktree: wt, readonly: true, runId: "ro-1" });
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

    const rw = await factory({ worktree: wt, readonly: false, runId: "rw-1" });
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
      IAM_TEST_RESOURCE_PROVIDER: "native",
      TURBO_CACHE_DIR: "/home/agent/.turbo-cache",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: ".husky",
    });
    for (const absent of ["DOCKER_HOST", "IAM_E2E_LIFECYCLE", "IAM_TEST_RESOURCE_REGISTRY"])
      expect(rwCall?.env?.[absent]).toBeUndefined();

    const stagedAuthPath = rwCall?.mounts?.[2]?.hostPath;
    expect(stagedAuthPath && existsSync(stagedAuthPath)).toBe(true);
    await rw.cleanup?.();
    expect(stagedAuthPath && existsSync(stagedAuthPath)).toBe(false);
    expect(existsSync(join(root, ".sandcastle", "resources"))).toBe(false);
    expect(existsSync(join(wt, ".sandcastle", "resources"))).toBe(false);
  });
});

describe("GitHub check-runs strict head_sha matching and CI failure log redaction/truncation", () => {
  test("strictly matches head_sha === finalSha && name === 'ci-gate', paginates, and selects highest run id", async () => {
    const [targetSha, staleSha] = ["a".repeat(40), "b".repeat(40)];
    const page1 = [
      checkRun(10, "ci-gate", staleSha),
      checkRun(20, "fast", targetSha),
      checkRun(30, "ci-gate", targetSha, "completed", "failure"),
    ];
    const page2 = [checkRun(40, "ci-gate", targetSha, "in_progress", null), checkRun(50, "ci-gate", staleSha)];
    const calls: string[] = [];
    const filtered = await listCommitCheckRuns(REPO, targetSha, process.cwd(), async (_f, args) => {
      const ep = args[1] ?? "";
      calls.push(ep);
      return JSON.stringify({ total_count: 102, check_runs: ep.includes("page=2") ? page2 : page1 });
    });
    expect(calls).toEqual([
      `repos/${REPO}/commits/${targetSha}/check-runs?per_page=100`,
      `repos/${REPO}/commits/${targetSha}/check-runs?per_page=100&page=2`,
    ]);
    expect(filtered.every((r) => r.head_sha === targetSha)).toBe(true);
    expect(filtered.map((r) => r.id)).toEqual([20, 30, 40]);
    const latest = selectLatestCiGateCheckRun(filtered, targetSha);
    expect(latest?.id).toBe(40);
    expect(latest?.status).toBe("in_progress");
    expect(
      selectLatestCiGateCheckRun(
        [checkRun(99, "ci-gate", staleSha), checkRun(100, "integration", targetSha)],
        targetSha,
      ),
    ).toBeUndefined();
  });

  test("redacts tokens, auth headers, cookies, passwords, PEM private keys, and URL credentials and truncates tail", async () => {
    const rawLog = [
      "Authorization: Bearer super_secret_bearer_token_12345",
      "Proxy-Authorization: Basic dXNlcjpwYXNzMTIzNDU=",
      "Cookie: sid=topsecretcookie; csrf=abc",
      "Set-Cookie: session_id=anothersecret; HttpOnly; Secure",
      "GH_TOKEN=ghp_1234567890abcdefghij1234567890abcd",
      "PAT=github_pat_11ABCDEFGH0123456789_xyz9876543210",
      "OPENAI=sk-proj-abc1234567890defghijk",
      "AWS=AKIAIOSFODNN7EXAMPLE",
      "JWT=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "DB=postgresql://iam_test:db_secret_pass@127.0.0.1:5432/iam_test",
      "REDIS=redis://:redis_secret_pass@127.0.0.1:6379/0",
      "GIT=https://ghs_remotetoken1234567890@github.com/cyy1998/shgas-iam.git",
      '{"password":"json-password-1","client_secret":"json-secret-2","ok":"visible"}',
      "POSTGRES_PASSWORD=env-password-3&access_token=query-token-4&keep=yes",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEAtokenBodySecretLine1\nSecretLine2MoreBase64Content\n-----END RSA PRIVATE KEY-----",
      "FAIL apps/auth-api/src/login.test.ts: expected 200 received 500",
    ].join("\n");

    const redacted = redactSensitiveLog(rawLog);
    const leaked =
      "super_secret_bearer_token_12345 dXNlcjpwYXNzMTIzNDU= topsecretcookie anothersecret ghp_1234567890abcdefghij1234567890abcd github_pat_11ABCDEFGH0123456789_xyz9876543210 sk-proj-abc1234567890defghijk AKIAIOSFODNN7EXAMPLE dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U db_secret_pass redis_secret_pass ghs_remotetoken1234567890 json-password-1 json-secret-2 env-password-3 query-token-4 MIIEpAIBAAKCAQEAtokenBodySecretLine1";
    for (const secret of leaked.split(" ")) expect(redacted).not.toContain(secret);
    for (const kept of [
      "[REDACTED_PRIVATE_KEY]",
      "postgresql://iam_test:[REDACTED]@127.0.0.1:5432/iam_test",
      "redis://:[REDACTED]@127.0.0.1:6379/0",
      '"ok":"visible"',
      "FAIL apps/auth-api/src/login.test.ts: expected 200 received 500",
    ]) {
      expect(redacted).toContain(kept);
    }

    const truncated = sanitizeCiFailureLogs(
      Array.from({ length: 350 }, (_, i) => `line-${i + 1}: password=secret_${i + 1}`).join("\n"),
      { maxLines: 200 },
    );
    const lines = truncated.split("\n");
    expect(lines.length).toBe(200);
    expect(lines[0]).toContain("truncated 151 earlier lines");
    expect(lines.at(-1)).toBe("line-350: password=[REDACTED]");
    expect(truncated).not.toContain("line-1:");
    expect(truncated).not.toContain("secret_350");

    const charBounded = sanitizeCiFailureLogs(`${"x".repeat(5000)}TAIL_ERROR_MARKER`, { maxLines: 200, maxChars: 256 });
    expect(charBounded.length).toBeLessThanOrEqual(256);
    expect(charBounded).toContain("TAIL_ERROR_MARKER");

    const headSha = "c".repeat(40);
    const fallbackLog = await fetchSanitizedCiFailureLogs({
      repo: REPO,
      headSha,
      cwd: process.cwd(),
      ciGate: checkRun(77, "ci-gate", headSha, "completed", "failure"),
      execFn: async (_f, args) => {
        if (args[1]?.includes("/actions/runs?head_sha="))
          return JSON.stringify({
            workflow_runs: [
              {
                id: 501,
                name: "CI",
                head_sha: headSha,
                status: "completed",
                conclusion: "failure",
              } satisfies WorkflowRun,
            ],
          });
        if (args[0] === "run" && args[1] === "view") throw new Error("log unavailable");
        if (args[1]?.includes("/actions/runs/501/jobs"))
          return JSON.stringify({
            jobs: [
              {
                name: "integration",
                status: "completed",
                conclusion: "failure",
                steps: [{ name: "Run full integration suite", status: "completed", conclusion: "failure" }],
              },
            ],
          });
        return "";
      },
    });
    expect(fallbackLog).toContain('Job "integration"');
    expect(fallbackLog).toContain('step "Run full integration suite"');
  });
});

type CiGateScenarioConfig = {
  specNumber: number;
  existingPr?: boolean;
  draft?: boolean;
  ciPollIntervalMs?: number;
  ciTimeoutMs?: number;
  ciRunAppearanceTimeoutMs?: number;
  ciMaxRepairs?: number;
  onAuthCheck?: () => boolean;
  onPrCreate?: (args: string[]) => void;
  onPrView?: () => { state?: "OPEN" | "CLOSED" | "MERGED"; isDraft?: boolean };
  onCheckRuns?: (sha: string) => CheckRun[];
  onWorkflowRuns?: (sha: string) => WorkflowRun[];
  failedLog?: string;
  onRepairCi?: (ctx: { worktree: string; prompt: string; attempt: number }) => Promise<string>;
};

async function setupCiGateScenario(cfg: CiGateScenarioConfig) {
  const [specNumber, ticketNumber] = [cfg.specNumber, cfg.specNumber + 1];
  const [prUrl, specBranch] = [`https://github.com/${REPO}/pull/${specNumber}`, `sandcastle/spec-${specNumber}`];
  const base = await makeTempDir(`afk-ci-spec-${specNumber}-`);
  const [bareRemoteDir, repoDir] = [join(base, "remote.git"), join(base, "repo")];
  await Promise.all([mkdir(bareRemoteDir, { recursive: true }), mkdir(repoDir, { recursive: true })]);

  await gitNoHooks(bareRemoteDir, "init", "--bare", "-q", "-b", "main");
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.name", "Sandcastle Test"],
    ["config", "user.email", "test@example.invalid"],
    ["remote", "add", "origin", bareRemoteDir],
  ]) {
    await gitNoHooks(repoDir, ...args);
  }
  await commitFile(repoDir, "README.md", "base\n", "init main");
  await gitNoHooks(repoDir, "push", "-q", "-u", "origin", "main");
  await gitNoHooks(repoDir, "checkout", "-q", "-b", specBranch);
  await gitNoHooks(repoDir, "checkout", "-q", "-b", `sandcastle/ticket-${ticketNumber}`);
  const tip = await commitFile(
    repoDir,
    `ticket-${ticketNumber}.txt`,
    `impl #${ticketNumber}\n`,
    `feat: implement #${ticketNumber}`,
  );
  await gitNoHooks(repoDir, "checkout", "-q", specBranch);
  await gitNoHooks(
    repoDir,
    "merge",
    "--no-ff",
    "-q",
    "-m",
    `Merge #${ticketNumber}: Ticket\n\nSandcastle-Ticket: #${ticketNumber}`,
    tip,
  );
  await gitNoHooks(repoDir, "branch", "-D", `sandcastle/ticket-${ticketNumber}`);
  const initialHeadSha = await gitNoHooks(repoDir, "rev-parse", "HEAD");
  if (cfg.existingPr) await gitNoHooks(repoDir, "push", "-q", "-u", "origin", specBranch);
  await gitNoHooks(repoDir, "checkout", "-q", "main");

  const ghCalls: string[][] = [];
  const phaseCalls: { runId: string; readonly: boolean; prompt: string }[] = [];
  const removedReadyLabels: number[] = [];
  const pausedCalls: { spec: number; reason: string }[] = [];
  let [nowMs, repairAttempts] = [1_000_000, 0];
  const specWorktreePath = join(repoDir, ".sandcastle", "worktrees", `spec-${specNumber}`);

  const ghExec: ExecFn = async (_f, args) => {
    ghCalls.push(args);
    const [cmd, sub] = args;
    if (cmd === "issue" && sub === "edit") {
      if (args.includes("--remove-label")) removedReadyLabels.push(Number(args[2]));
      return "";
    }
    if (cmd === "issue" && sub === "comment") {
      pausedCalls.push({ spec: Number(args[2]), reason: args[args.indexOf("--body") + 1] ?? "" });
      return "";
    }
    if (cmd === "api" && sub === "graphql") {
      const q = args.find((a) => a.startsWith("query=")) ?? "";
      if (!q.includes("subIssues")) {
        const labels = (cfg.onAuthCheck ? cfg.onAuthCheck() : true) ? ["type:spec", "ready-for-agent"] : ["type:spec"];
        return JSON.stringify({ data: { repository: { issue: { state: "OPEN", labels: labelPage(labels) } } } });
      }
      return specGraphql(specNumber, {
        subIssues: [
          {
            number: ticketNumber,
            title: `Ticket ${ticketNumber}`,
            body: "Ticket body",
            state: "OPEN",
            labels: labelPage(["type:ticket", "ready-for-agent"]),
            comments: page([]),
            blockedBy: page([]),
          },
        ],
      });
    }
    if (cmd === "pr" && sub === "list")
      return JSON.stringify(
        cfg.existingPr
          ? [prEntry(specNumber, specBranch, `Existing PR\n\nCloses #${specNumber}\nCloses #${ticketNumber}\n`)]
          : [],
      );
    if (cmd === "pr" && sub === "create") {
      cfg.onPrCreate?.(args);
      return prUrl;
    }
    if (cmd === "pr" && sub === "view") {
      if (cfg.draft) throw new Error("Unexpected pr view in --draft mode");
      const v = cfg.onPrView?.();
      return JSON.stringify({
        number: specNumber,
        url: prUrl,
        state: v?.state ?? "OPEN",
        isDraft: v?.isDraft ?? false,
      });
    }
    if (cmd === "api" && sub?.includes("/check-runs")) {
      if (cfg.draft) throw new Error("Unexpected check-runs in --draft mode");
      const runs = cfg.onCheckRuns?.(/commits\/([0-9a-f]+)\/check-runs/.exec(sub)?.[1] ?? "") ?? [];
      return JSON.stringify({ total_count: runs.length, check_runs: runs });
    }
    if (cmd === "api" && sub?.includes("/actions/runs?head_sha=")) {
      return JSON.stringify({ workflow_runs: cfg.onWorkflowRuns?.(/head_sha=([0-9a-f]+)/.exec(sub)?.[1] ?? "") ?? [] });
    }
    if (cmd === "run" && sub === "view") return cfg.failedLog ?? "";
    throw new Error(`Unexpected gh call: ${args.join(" ")}`);
  };

  const PREFIX = "__MOCK_AGENT_PROMPT__:";
  const agent: AgentProvider = {
    name: "mock-agent",
    env: {},
    captureSessions: false,
    parseStreamLine: (line) => [{ type: "text", text: line }],
    buildPrintCommand: ({ prompt }) => ({ command: `${PREFIX}${prompt}` }),
  };
  const slot = { provider: agent, instructions: "Role instructions" };
  const options: AfkOptions = {
    repo: REPO,
    cwd: repoDir,
    specNumber,
    draft: cfg.draft,
    promptsDir: PROMPTS_DIR,
    ghExec,
    ciPollIntervalMs: cfg.ciPollIntervalMs ?? 30_000,
    ciTimeoutMs: cfg.ciTimeoutMs ?? 45 * 60_000,
    ciRunAppearanceTimeoutMs: cfg.ciRunAppearanceTimeoutMs ?? 5 * 60_000,
    ciMaxRepairs: cfg.ciMaxRepairs ?? 2,
    agents: { light: slot, standard: slot, deep: slot, reviewStandards: slot, reviewSpec: slot, repair: slot },
    gitExec: async (f, a, c) =>
      f === "git" && a[0] === "remote" && a[1] === "get-url" ? `https://github.com/${REPO}.git` : runCommand(f, a, c),
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
    createSession: async ({ worktree, readonly, runId }) => ({
      sandbox: createBindMountSandboxProvider({
        name: "mock-sandbox",
        create: async () => ({
          sandboxId: `sb-${runId}`,
          worktreePath: worktree,
          ...noopSandbox,
          exec: async (cmd, execOpts) => {
            if (!cmd.startsWith(PREFIX))
              return {
                exitCode: 0,
                stdout: cmd.includes("rev-parse --abbrev-ref HEAD") ? `${specBranch}\n` : "",
                stderr: "",
              };
            const prompt = cmd.slice(PREFIX.length);
            phaseCalls.push({ runId, readonly, prompt });
            const output =
              runId.includes("-repair-ci-") && cfg.onRepairCi
                ? await cfg.onRepairCi({ worktree, prompt, attempt: ++repairAttempts })
                : `<pr-body>\n## Summary\n\nAutomated PR\n</pr-body>\n${COMPLETE}\n`;
            for (const line of output.split(/\r?\n/)) execOpts?.onLine?.(line);
            return { exitCode: 0, stdout: output, stderr: "" };
          },
        }),
      }),
    }),
  };
  return {
    repoDir,
    specBranch,
    specWorktreePath,
    prUrl,
    initialHeadSha,
    ghCalls,
    phaseCalls,
    removedReadyLabels,
    pausedCalls,
    clockMs: () => nowMs,
    run: () => runAfk(options),
  };
}

describe("Option-1 remote ci-gate wait, bounded auto-repair, --draft delivery, and crash/restart resume", () => {
  test("--draft delivers immediately without polling ci-gate, cleans worktree, and removes ready-for-agent", async () => {
    let sawDraft = false;
    const sc = await setupCiGateScenario({
      specNumber: 601,
      draft: true,
      onPrCreate: (a) => {
        sawDraft = a.includes("--draft");
      },
    });
    const res = await sc.run();
    expect(sawDraft).toBe(true);
    expect(res.delivered).toEqual([{ spec: 601, branch: sc.specBranch, prUrl: sc.prUrl, tickets: [602] }]);
    expect(res.paused).toEqual([]);
    expect(res.stopped).toEqual([]);
    expect(sc.removedReadyLabels).toEqual([602, 601]);
    expect(existsSync(sc.specWorktreePath)).toBe(false);
    expect(sc.ghCalls.some((a) => a.join(" ").includes("check-runs") || (a[0] === "pr" && a[1] === "view"))).toBe(
      false,
    );
  });

  test("ignores stale-SHA green ci-gate, auto-repairs up to 2 attempts with redacted failure logs, and delivers on green", async () => {
    const staleSha = "1".repeat(40);
    const [repairCommits, repairPrompts] = [[] as string[], [] as string[]];
    let sha1Polls = 0;
    const sc = await setupCiGateScenario({
      specNumber: 610,
      ciMaxRepairs: 2,
      failedLog:
        "Authorization: Bearer leaked_ci_token_999\nPOSTGRES_PASSWORD=leaked_db_pwd\nError: assertion failed in integration suite\n",
      onCheckRuns: (sha) => {
        if (sha === sc.initialHeadSha) {
          return ++sha1Polls === 1
            ? [
                checkRun(100, "ci-gate", staleSha),
                checkRun(101, "fast", sha),
                checkRun(102, "integration", sha, "in_progress", null),
              ]
            : [checkRun(103, "ci-gate", sha, "completed", "failure")];
        }
        if (sha === repairCommits[0]) return [checkRun(201, "ci-gate", sha, "completed", "failure")];
        if (sha === repairCommits[1]) {
          expect(existsSync(sc.specWorktreePath)).toBe(true);
          return [checkRun(301, "ci-gate", sha)];
        }
        return [];
      },
      onWorkflowRuns: (sha) => [{ id: 901, name: "CI", head_sha: sha, status: "completed", conclusion: "failure" }],
      onRepairCi: async ({ worktree, prompt, attempt }) => {
        repairPrompts.push(prompt);
        repairCommits.push(
          await commitFile(worktree, `ci-fix-${attempt}.txt`, `fix ${attempt}\n`, `fix(ci): attempt ${attempt}`),
        );
        return `Fixed attempt ${attempt}\n${COMPLETE}\n`;
      },
    });
    const res = await sc.run();
    expect(res.delivered).toEqual([{ spec: 610, branch: sc.specBranch, prUrl: sc.prUrl, tickets: [611] }]);
    expect(res.paused).toEqual([]);
    expect(sha1Polls).toBe(2);
    expect(repairCommits).toHaveLength(2);
    expect(repairPrompts).toHaveLength(2);
    expect(repairPrompts[0]).toContain("Error: assertion failed in integration suite");
    expect(repairPrompts[0]).not.toContain("leaked_ci_token_999");
    expect(repairPrompts[0]).not.toContain("leaked_db_pwd");
    expect(sc.removedReadyLabels).toEqual([611, 610]);
    expect(existsSync(sc.specWorktreePath)).toBe(false);
    expect(
      (await runCommand("git", ["ls-remote", "--heads", "origin", `refs/heads/${sc.specBranch}`], sc.repoDir)).trim(),
    ).toBe(`${repairCommits[1]}\trefs/heads/${sc.specBranch}`);
  });

  test("pauses Spec with needs-attention and preserves worktree after exhausting ciMaxRepairs = 2", async () => {
    let repairs = 0;
    const sc = await setupCiGateScenario({
      specNumber: 620,
      ciMaxRepairs: 2,
      failedLog: "persistent failure",
      onCheckRuns: (sha) => [checkRun(500 + repairs, "ci-gate", sha, "completed", "failure")],
      onWorkflowRuns: (sha) => [
        { id: 700 + repairs, name: "CI", head_sha: sha, status: "completed", conclusion: "failure" },
      ],
      onRepairCi: async ({ worktree, attempt }) => {
        repairs = attempt;
        await commitFile(worktree, `attempt-${attempt}.txt`, `${attempt}\n`, `fix attempt ${attempt}`);
        return `${COMPLETE}\n`;
      },
    });
    const res = await sc.run();
    expect(repairs).toBe(2);
    expect(res.delivered).toEqual([]);
    expect(res.paused).toHaveLength(1);
    expect(res.paused[0]?.reason).toContain("自动修红上限（2 次）");
    expect(sc.pausedCalls).toHaveLength(1);
    expect(sc.removedReadyLabels).toEqual([]);
    expect(existsSync(sc.specWorktreePath)).toBe(true);
  });

  test("idempotently resumes straight into ci-gate loop when all tickets are integrated and open Ready PR already exists", async () => {
    const sc = await setupCiGateScenario({
      specNumber: 630,
      existingPr: true,
      onCheckRuns: (sha) => {
        expect(sha).toBe(sc.initialHeadSha);
        return [checkRun(801, "ci-gate", sha)];
      },
    });
    const res = await sc.run();
    expect(res.delivered).toEqual([{ spec: 630, branch: sc.specBranch, prUrl: sc.prUrl, tickets: [631] }]);
    expect(sc.phaseCalls).toEqual([]);
    expect(sc.removedReadyLabels).toEqual([631, 630]);
    expect(existsSync(sc.specWorktreePath)).toBe(false);
  });

  test("soft-stops into result.stopped when Spec authorization is revoked during ci-gate wait", async () => {
    let authChecks = 0;
    const sc = await setupCiGateScenario({
      specNumber: 640,
      existingPr: true,
      onAuthCheck: () => ++authChecks === 1,
      onCheckRuns: (sha) => [checkRun(1, "ci-gate", sha, "in_progress", null)],
    });
    const res = await sc.run();
    expect(res.stopped).toEqual([640]);
    expect(res.paused).toEqual([]);
    expect(res.delivered).toEqual([]);
    expect(sc.pausedCalls).toEqual([]);
    expect(existsSync(sc.specWorktreePath)).toBe(true);
  });

  test("pauses cleanly when PR is externally closed during ci-gate wait", async () => {
    let views = 0;
    const sc = await setupCiGateScenario({
      specNumber: 650,
      existingPr: true,
      onPrView: () => ({ state: ++views === 1 ? "OPEN" : "CLOSED" }),
      onCheckRuns: (sha) => [checkRun(1, "ci-gate", sha, "queued", null)],
    });
    const res = await sc.run();
    expect(res.paused).toHaveLength(1);
    expect(res.paused[0]?.reason).toContain("CLOSED");
    expect(res.delivered).toEqual([]);
    expect(existsSync(sc.specWorktreePath)).toBe(true);
  });

  test("pauses with needs-attention on missing-run timeout and on overall ci-gate poll timeout", async () => {
    const missing = await setupCiGateScenario({
      specNumber: 660,
      existingPr: true,
      ciPollIntervalMs: 30_000,
      ciRunAppearanceTimeoutMs: 60_000,
      ciTimeoutMs: 600_000,
    });
    expect((await missing.run()).paused[0]?.reason).toContain("触发远端 ci-gate 超时");
    expect(missing.clockMs()).toBe(1_060_000);

    const timeout = await setupCiGateScenario({
      specNumber: 670,
      existingPr: true,
      ciPollIntervalMs: 30_000,
      ciRunAppearanceTimeoutMs: 60_000,
      ciTimeoutMs: 120_000,
      onWorkflowRuns: (sha) => [{ id: 88, name: "CI", head_sha: sha, status: "in_progress", conclusion: null }],
    });
    expect((await timeout.run()).paused[0]?.reason).toContain("完成超时");
    expect(timeout.clockMs()).toBe(1_120_000);
  });

  test("pauses cleanly when repair-ci agent exits COMPLETE without creating a new commit", async () => {
    const sc = await setupCiGateScenario({
      specNumber: 680,
      existingPr: true,
      onCheckRuns: (sha) => [checkRun(9, "ci-gate", sha, "completed", "failure")],
      onRepairCi: async () => `No commit created\n${COMPLETE}\n`,
    });
    const res = await sc.run();
    expect(res.paused).toHaveLength(1);
    expect(res.paused[0]?.reason).toContain("未产生新提交");
    expect(existsSync(sc.specWorktreePath)).toBe(true);
  });
});
