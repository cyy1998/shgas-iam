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

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function captureError(fn: () => Promise<unknown>): Promise<Error | undefined> {
  try {
    await fn();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

afterEach(async () => {
  for (let dir = tempDirs.pop(); dir !== undefined; dir = tempDirs.pop()) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("GitHub GraphQL filtering, pagination overflow, linkedBranches, and PR reuse", () => {
  test("lists only ready-for-agent specs without needs-attention and rejects pagination overflow", async () => {
    let capturedQuery = "";
    const nums = await listReadySpecNumbers(REPO, process.cwd(), async (_file, args) => {
      capturedQuery = args.join(" ");
      return JSON.stringify({
        data: {
          repository: {
            issues: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  number: 440,
                  labels: {
                    pageInfo: { hasNextPage: false },
                    nodes: [{ name: "type:spec" }, { name: "ready-for-agent" }],
                  },
                },
                {
                  number: 433,
                  labels: {
                    pageInfo: { hasNextPage: false },
                    nodes: [{ name: "type:spec" }, { name: "ready-for-agent" }],
                  },
                },
                {
                  number: 430,
                  labels: {
                    pageInfo: { hasNextPage: false },
                    nodes: [{ name: "type:spec" }, { name: "ready-for-agent" }, { name: "needs-attention" }],
                  },
                },
              ],
            },
          },
        },
      });
    });

    expect(capturedQuery).toContain('labels:["type:spec","ready-for-agent"]');
    expect(nums).toEqual([433, 440]);

    const overflowErr = await captureError(() =>
      listReadySpecNumbers(REPO, process.cwd(), async () =>
        JSON.stringify({ data: { repository: { issues: { pageInfo: { hasNextPage: true }, nodes: [] } } } }),
      ),
    );
    expect(overflowErr?.message).toContain("分页溢出");
  });

  test("resolves Spec branch from linkedBranches, rejects invalid branches, and reuses same-repo Open PR", async () => {
    const makePayload = (linkedBranches: string[], hasNextPage = false) =>
      JSON.stringify({
        data: {
          repository: {
            issue: {
              number: 450,
              title: "Demo",
              body: "Spec body",
              state: "OPEN",
              labels: {
                pageInfo: { hasNextPage: false },
                nodes: [{ name: "type:spec" }, { name: "ready-for-agent" }],
              },
              comments: { pageInfo: { hasNextPage: false }, nodes: [] },
              linkedBranches: {
                pageInfo: { hasNextPage },
                nodes: linkedBranches.map((name) => ({ ref: { name } })),
              },
              subIssues: { pageInfo: { hasNextPage: false }, nodes: [] },
            },
          },
        },
      });

    const defaultSpec = await readSpec(REPO, 450, process.cwd(), async () => makePayload([]));
    expect(resolveSpecBranch(defaultSpec, "main")).toBe("sandcastle/spec-450");

    const linkedSpec = await readSpec(REPO, 450, process.cwd(), async () => makePayload(["feat/user-sync"]));
    expect(resolveSpecBranch(linkedSpec, "main")).toBe("feat/user-sync");

    const mainSpec = await readSpec(REPO, 450, process.cwd(), async () => makePayload(["main"]));
    expect(() => resolveSpecBranch(mainSpec, "release/v1")).toThrow("不得为 main");

    const multiSpec = await readSpec(REPO, 450, process.cwd(), async () => makePayload(["feat/a", "feat/b"]));
    expect(() => resolveSpecBranch(multiSpec, "main")).toThrow("关联了多个分支");

    const overflowErr = await captureError(() =>
      readSpec(REPO, 450, process.cwd(), async () => makePayload(["feat/a"], true)),
    );
    expect(overflowErr?.message).toContain("分页溢出");

    const partialSpec = {
      ...defaultSpec,
      subIssues: [
        {
          number: 451,
          title: "A",
          body: "",
          state: "OPEN" as const,
          labels: ["type:ticket", "ready-for-agent"],
          comments: [],
          blockedBy: [],
        },
        {
          number: 452,
          title: "B",
          body: "",
          state: "OPEN" as const,
          labels: ["type:ticket", "needs-attention"],
          comments: [],
          blockedBy: [],
        },
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
      execFn: async (_file, args) => {
        calls.push(args);
        if (args[1] === "list") {
          return JSON.stringify([
            {
              number: 99,
              url: "https://github.com/cyy1998/shgas-iam/pull/99",
              body: "Existing\n\nCloses #450\n",
              state: "OPEN",
              isDraft: false,
              isCrossRepository: false,
              headRefName: "feat/user-sync",
              baseRefName: "main",
            },
          ]);
        }
        return "";
      },
    });
    expect(prUrl).toBe("https://github.com/cyy1998/shgas-iam/pull/99");
    expect(calls.some((args) => args[1] === "edit" && args.includes("99"))).toBe(true);
    expect(calls.some((args) => args[1] === "create")).toBe(false);
  });
});

describe("Credential preflight, remote URLs, Git refs/merges, completion/tag extraction, and CLI args", () => {
  test("rejects GH_TOKEN/GITHUB_TOKEN in root or worktree .sandcastle/.env and .git/config auth", async () => {
    const root = await makeTempDir("afk-creds-root-");
    const wt = await makeTempDir("afk-creds-wt-");
    await mkdir(join(root, ".git"), { recursive: true });
    await writeFile(join(root, ".git", "config"), "[core]\n\trepositoryformatversion = 0\n");

    await preflightCredentials(root, [wt]);

    await mkdir(join(wt, ".sandcastle"), { recursive: true });
    await writeFile(join(wt, ".sandcastle", ".env"), 'NOTE="line1\nGH_TOKEN=\nline2"\n');
    const wtErr = await captureError(() => preflightCredentials(root, [wt]));
    expect(wtErr?.message).toContain("GH_TOKEN");

    await rm(join(wt, ".sandcastle", ".env"));
    await writeFile(join(root, ".git", "config"), "[http]\n\textraHeader = AUTHORIZATION: basic abc\n");
    const gitErr = await captureError(() => preflightCredentials(root, [wt]));
    expect(gitErr?.message).toContain("Authorization");
  });

  test("validates both push and fetch remote URLs against github.com/<repo>", async () => {
    expect(parseGitHubRepoUrl("git@github.com:cyy1998/shgas-iam.git")).toBe("cyy1998/shgas-iam");
    expect(parseGitHubRepoUrl("https://github.com/cyy1998/shgas-iam")).toBe("cyy1998/shgas-iam");
    expect(parseGitHubRepoUrl("https://evil.example.com/cyy1998/shgas-iam.git")).toBeUndefined();

    await verifyGitRemote(
      process.cwd(),
      "origin",
      REPO,
      async () => "git@github.com:cyy1998/shgas-iam.git\nhttps://github.com/cyy1998/shgas-iam.git",
    );

    const badFetchErr = await captureError(() =>
      verifyGitRemote(process.cwd(), "origin", REPO, async (_f, args) =>
        args.includes("--push")
          ? "git@github.com:cyy1998/shgas-iam.git"
          : "https://evil.example.com/cyy1998/shgas-iam.git",
      ),
    );
    expect(badFetchErr?.message).toContain("fetch URL");
  });

  test("supports exact branchExists, extractTag last-match, completion/Closes/CLI helpers, and relaxed verifyMergeCommit", async () => {
    const repo = await makeTempDir("afk-git-ref-");
    const git = (...args: string[]) => runCommand("git", ["-c", "core.hooksPath=/dev/null", ...args], repo);
    await git("init", "-q");
    await git("config", "user.name", "Test");
    await git("config", "user.email", "test@example.invalid");
    await writeFile(join(repo, "README.md"), "base\n");
    await git("add", "README.md");
    await git("commit", "-q", "-m", "init");
    await git("branch", "feat/foo/bar");

    expect(await branchExists(repo, "feat/foo/bar")).toBe(true);
    expect(await branchExists(repo, "feat/foo")).toBe(false);

    // Relaxed verifyMergeCommit: merge commit with trailer followed by a normal follow-up fix commit.
    const specTipBefore = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "-b", "ticket-7");
    await writeFile(join(repo, "ticket.txt"), "ticket change\n");
    await git("add", "ticket.txt");
    await git("commit", "-q", "-m", "ticket #7");
    const ticketTip = await git("rev-parse", "HEAD");

    await git("checkout", "-q", "-");
    await git("merge", "--no-ff", "-m", "Merge #7: demo\n\nSandcastle-Ticket: #7", ticketTip);
    const expectedMergeSha = await git("rev-parse", "HEAD");
    await writeFile(join(repo, "ticket.txt"), "ticket change + lint fix\n");
    await git("add", "ticket.txt");
    await git("commit", "-q", "-m", "chore: follow-up fix after merge");

    const verifiedSha = await verifyMergeCommit(repo, specTipBefore, ticketTip, 7);
    expect(verifiedSha).toBe(expectedMergeSha);

    // Merge commit without trailer followed by another commit must reject clearly.
    const specTipBefore2 = await git("rev-parse", "HEAD");
    await git("checkout", "-q", "-b", "ticket-8");
    await writeFile(join(repo, "ticket8.txt"), "ticket 8\n");
    await git("add", "ticket8.txt");
    await git("commit", "-q", "-m", "ticket #8");
    const ticket8Tip = await git("rev-parse", "HEAD");

    await git("checkout", "-q", "-");
    await git("merge", "--no-ff", "-m", "Merge #8 without trailer", ticket8Tip);
    await writeFile(join(repo, "ticket8.txt"), "ticket 8 follow-up\n");
    await git("add", "ticket8.txt");
    await git("commit", "-q", "-m", "fixup after merge #8");

    const missingTrailerErr = await captureError(() => verifyMergeCommit(repo, specTipBefore2, ticket8Tip, 8));
    expect(missingTrailerErr?.message).toContain("Sandcastle-Ticket: #8");

    const prose =
      "说明：请将正文放在 <pr-body>示例占位</pr-body> 标签中。\n\n<pr-body>\n## Summary\n\n真实 PR 正文\n</pr-body>\n";
    expect(extractTag(prose, "pr-body")).toBe("## Summary\n\n真实 PR 正文");

    expect(hasStandaloneCompletion("done\n<promise>COMPLETE</promise>\n")).toBe(true);
    expect(hasStandaloneCompletion("failed: did not emit <promise>COMPLETE</promise>")).toBe(false);
    expect(ensureClosesLines("Summary\n\nCloses #433\n", [433, 434])).toContain("Closes #434");

    expect(parsePositiveInt("--parallel", "4")).toBe(4);
    expect(() => parsePositiveInt("--parallel", "0")).toThrow("正整数");
    expect(() => parsePositiveInt("--parallel", "abc")).toThrow("正整数");
    expect(() => parsePositiveInt("--iterations", "-1")).toThrow("正整数");
    expect(() => parsePositiveInt("--spec", "")).toThrow("正整数");

    expect(parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "0")).toBe(0);
    expect(parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "2")).toBe(2);
    expect(() => parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "-1")).toThrow("非负整数");
    expect(() => parseNonNegativeInt("SANDCASTLE_CI_MAX_REPAIRS", "abc")).toThrow("非负整数");
  });
});

describe("Plan X unprivileged session isolation and one-way auth staging", () => {
  test("creates readonly and writable sessions with zero docker.sock/network:host/groups and IAM_TEST_RESOURCE_PROVIDER=native", async () => {
    const root = await makeTempDir("afk-session-");
    const wt = await makeTempDir("afk-session-wt-");
    const authFile = join(root, "auth.json");
    const original = '{"token":"secret"}\n';
    await writeFile(authFile, original, { mode: 0o600 });

    const staged = await stageCodexAuth(root, { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile });
    expect(staged.mounts).toHaveLength(1);
    expect(staged.mounts[0]?.readonly).toBe(true);
    expect(staged.mounts[0]?.hostPath).not.toBe(authFile);
    await staged.close();
    expect(await readFile(authFile, "utf8")).toBe(original);

    type CapturedDockerOpts = {
      imageName?: string;
      mounts?: readonly MountConfig[];
      env?: Record<string, string>;
      groups?: readonly (string | number)[];
      network?: string | readonly string[];
    };
    const capturedProviderCalls: CapturedDockerOpts[] = [];
    const capturedCreateCalls: { mounts: MountConfig[]; env: Record<string, string> }[] = [];
    const fakeDocker = ((opts?: CapturedDockerOpts) => {
      capturedProviderCalls.push({
        imageName: opts?.imageName,
        mounts: opts?.mounts,
        env: opts?.env,
        groups: opts?.groups,
        network: opts?.network,
      });
      return createBindMountSandboxProvider({
        name: "fake-docker",
        create: async (createOpts) => {
          capturedCreateCalls.push({ mounts: [...createOpts.mounts], env: { ...createOpts.env } });
          return {
            sandboxId: "sandcastle-test-container",
            worktreePath: createOpts.worktreePath,
            exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
            copyFileIn: async () => {},
            copyFileOut: async () => {},
            close: async () => {},
          };
        },
      });
    }) as unknown as typeof import("@ai-hero/sandcastle/sandboxes/docker").docker;

    const hostStore = join(root, "pnpm-store");
    const turboCacheDir = join(root, "turbo-cache");
    const factory = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile },
      imageName: "iam-sandcastle:local",
      hostStore,
      turboCacheDir,
      createDockerProvider: fakeDocker,
    });

    // 1. Read-only review session.
    const ro = await factory({ worktree: wt, readonly: true, runId: "ro-1" });
    expect(ro.hooks).toBeUndefined();
    expect(capturedProviderCalls[0]?.groups).toBeUndefined();
    expect(capturedProviderCalls[0]?.network).toBeUndefined();
    expect(capturedProviderCalls[0]?.env).toEqual({ CODEX_HOME: "/home/agent/.codex" });
    expect(capturedProviderCalls[0]?.mounts?.every((m) => m.readonly === true)).toBe(true);
    expect(
      capturedProviderCalls[0]?.mounts?.some(
        (m) =>
          m.sandboxPath.includes("docker.sock") ||
          m.sandboxPath.includes("pnpm-store") ||
          m.sandboxPath.includes("turbo-cache") ||
          m.sandboxPath.includes(".docker/config.json"),
      ),
    ).toBe(false);

    const roProvider = ro.sandbox as unknown as {
      create: (opts: {
        worktreePath: string;
        hostRepoPath: string;
        mounts: MountConfig[];
        env: Record<string, string>;
      }) => Promise<unknown>;
    };
    await roProvider.create({
      worktreePath: wt,
      hostRepoPath: root,
      mounts: [
        { hostPath: wt, sandboxPath: "/home/agent/workspace" },
        { hostPath: join(root, ".git"), sandboxPath: "/home/agent/.git", readonly: false },
      ],
      env: {},
    });
    expect(capturedCreateCalls[0]?.mounts).toHaveLength(2);
    expect(capturedCreateCalls[0]?.mounts.every((m) => m.readonly === true)).toBe(true);
    await ro.cleanup?.();

    // 2. Writable Plan X unprivileged session.
    const rw = await factory({ worktree: wt, readonly: false, runId: "rw-1" });
    expect(rw.hooks?.sandbox?.onSandboxReady?.[0]?.command).toContain(
      "pnpm install --frozen-lockfile --prefer-offline",
    );
    const rwCall = capturedProviderCalls[1];
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
    expect(rwCall?.env?.DOCKER_HOST).toBeUndefined();
    expect(rwCall?.env?.IAM_E2E_LIFECYCLE).toBeUndefined();
    expect(rwCall?.env?.IAM_TEST_RESOURCE_REGISTRY).toBeUndefined();

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
    const targetSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const staleSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    const page1Runs: CheckRun[] = [
      { id: 10, name: "ci-gate", head_sha: staleSha, status: "completed", conclusion: "success" },
      { id: 20, name: "fast", head_sha: targetSha, status: "completed", conclusion: "success" },
      { id: 30, name: "ci-gate", head_sha: targetSha, status: "completed", conclusion: "failure" },
    ];
    const page2Runs: CheckRun[] = [
      { id: 40, name: "ci-gate", head_sha: targetSha, status: "in_progress", conclusion: null },
      { id: 50, name: "ci-gate", head_sha: staleSha, status: "completed", conclusion: "success" },
    ];

    const calls: string[] = [];
    const filtered = await listCommitCheckRuns(REPO, targetSha, process.cwd(), async (_file, args) => {
      const endpoint = args[1] ?? "";
      calls.push(endpoint);
      if (endpoint.includes("page=2")) {
        return JSON.stringify({ total_count: 102, check_runs: page2Runs });
      }
      return JSON.stringify({ total_count: 102, check_runs: page1Runs });
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

    // Stale-only or non-ci-gate check runs never match.
    expect(
      selectLatestCiGateCheckRun(
        [
          { id: 99, name: "ci-gate", head_sha: staleSha, status: "completed", conclusion: "success" },
          { id: 100, name: "integration", head_sha: targetSha, status: "completed", conclusion: "success" },
        ],
        targetSha,
      ),
    ).toBeUndefined();
  });

  test("redacts tokens, auth headers, cookies, passwords, PEM private keys, and URL credentials and truncates tail", async () => {
    const pemKey = [
      "-----BEGIN RSA PRIVATE KEY-----",
      "MIIEpAIBAAKCAQEAtokenBodySecretLine1",
      "SecretLine2MoreBase64Content",
      "-----END RSA PRIVATE KEY-----",
    ].join("\n");
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
      pemKey,
      "FAIL apps/auth-api/src/login.test.ts: expected 200 received 500",
    ].join("\n");

    const redacted = redactSensitiveLog(rawLog);
    for (const secret of [
      "super_secret_bearer_token_12345",
      "dXNlcjpwYXNzMTIzNDU=",
      "topsecretcookie",
      "anothersecret",
      "ghp_1234567890abcdefghij1234567890abcd",
      "github_pat_11ABCDEFGH0123456789_xyz9876543210",
      "sk-proj-abc1234567890defghijk",
      "AKIAIOSFODNN7EXAMPLE",
      "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "db_secret_pass",
      "redis_secret_pass",
      "ghs_remotetoken1234567890",
      "json-password-1",
      "json-secret-2",
      "env-password-3",
      "query-token-4",
      "MIIEpAIBAAKCAQEAtokenBodySecretLine1",
    ]) {
      expect(redacted).not.toContain(secret);
    }
    expect(redacted).toContain("[REDACTED_PRIVATE_KEY]");
    expect(redacted).toContain("postgresql://iam_test:[REDACTED]@127.0.0.1:5432/iam_test");
    expect(redacted).toContain("redis://:[REDACTED]@127.0.0.1:6379/0");
    expect(redacted).toContain('"ok":"visible"');
    expect(redacted).toContain("FAIL apps/auth-api/src/login.test.ts: expected 200 received 500");

    // 350 lines -> strictly capped to 200 lines preserving tail + truncation marker.
    const manyLines = Array.from({ length: 350 }, (_, i) => `line-${i + 1}: password=secret_${i + 1}`).join("\n");
    const truncated = sanitizeCiFailureLogs(manyLines, { maxLines: 200 });
    const resultLines = truncated.split("\n");
    expect(resultLines.length).toBe(200);
    expect(resultLines[0]).toContain("truncated 151 earlier lines");
    expect(resultLines.at(-1)).toBe("line-350: password=[REDACTED]");
    expect(truncated).not.toContain("line-1:");
    expect(truncated).not.toContain("secret_350");

    // Bounded total character cap preserves tail even for huge single lines.
    const hugeLine = `${"x".repeat(5000)}TAIL_ERROR_MARKER`;
    const charBounded = sanitizeCiFailureLogs(hugeLine, { maxLines: 200, maxChars: 256 });
    expect(charBounded.length).toBeLessThanOrEqual(256);
    expect(charBounded).toContain("TAIL_ERROR_MARKER");

    // Fallback to jobs API summary when `gh run view --log-failed` fails.
    const headSha = "cccccccccccccccccccccccccccccccccccccccc";
    const fallbackLog = await fetchSanitizedCiFailureLogs({
      repo: REPO,
      headSha,
      cwd: process.cwd(),
      ciGate: { id: 77, name: "ci-gate", head_sha: headSha, status: "completed", conclusion: "failure" },
      execFn: async (_file, args) => {
        if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
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
        }
        if (args[0] === "run" && args[1] === "view") {
          throw new Error("log unavailable");
        }
        if (args[0] === "api" && args[1]?.includes("/actions/runs/501/jobs")) {
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
        }
        return "";
      },
    });
    expect(fallbackLog).toContain('Job "integration"');
    expect(fallbackLog).toContain('step "Run full integration suite"');
  });
});

type MockCiFixture = {
  repoDir: string;
  bareRemoteDir: string;
  specBranch: string;
  initialHeadSha: string;
  specNumber: number;
  ticketNumber: number;
  ghCalls: string[][];
  phaseCalls: { runId: string; readonly: boolean; prompt: string }[];
  removedReadyLabels: number[];
  pausedCalls: { spec: number; reason: string }[];
  clockMs: () => number;
  createOptions: (overrides: {
    draft?: boolean;
    ciPollIntervalMs?: number;
    ciTimeoutMs?: number;
    ciRunAppearanceTimeoutMs?: number;
    ciMaxRepairs?: number;
    onGh: (args: string[]) => string | Promise<string>;
    onAgentPhase?: (ctx: { runId: string; readonly: boolean; worktree: string; prompt: string }) => Promise<string>;
  }) => AfkOptions;
};

async function createAfkCiFixture(opts: {
  specNumber: number;
  ticketNumber: number;
  pushInitialSpecBranch?: boolean;
}): Promise<MockCiFixture> {
  const base = await makeTempDir(`afk-ci-spec-${opts.specNumber}-`);
  const bareRemoteDir = join(base, "remote.git");
  const repoDir = join(base, "repo");
  const specBranch = `sandcastle/spec-${opts.specNumber}`;

  await mkdir(bareRemoteDir, { recursive: true });
  await mkdir(repoDir, { recursive: true });

  const git = (dir: string, ...args: string[]) => runCommand("git", ["-c", "core.hooksPath=/dev/null", ...args], dir);

  await git(bareRemoteDir, "init", "--bare", "-q", "-b", "main");
  await git(repoDir, "init", "-q", "-b", "main");
  await git(repoDir, "config", "user.name", "Sandcastle Test");
  await git(repoDir, "config", "user.email", "test@example.invalid");
  await git(repoDir, "remote", "add", "origin", bareRemoteDir);

  await writeFile(join(repoDir, "README.md"), "base\n");
  await git(repoDir, "add", "README.md");
  await git(repoDir, "commit", "-q", "-m", "init main");
  await git(repoDir, "push", "-q", "-u", "origin", "main");

  // Create specBranch with ticket already integrated via --no-ff + Sandcastle-Ticket trailer.
  await git(repoDir, "checkout", "-q", "-b", specBranch);
  await git(repoDir, "checkout", "-q", "-b", `sandcastle/ticket-${opts.ticketNumber}`);
  await writeFile(join(repoDir, `ticket-${opts.ticketNumber}.txt`), `impl #${opts.ticketNumber}\n`);
  await git(repoDir, "add", `ticket-${opts.ticketNumber}.txt`);
  await git(repoDir, "commit", "-q", "-m", `feat: implement #${opts.ticketNumber}`);
  const ticketTip = await git(repoDir, "rev-parse", "HEAD");
  await git(repoDir, "checkout", "-q", specBranch);
  await git(
    repoDir,
    "merge",
    "--no-ff",
    "-q",
    "-m",
    `Merge #${opts.ticketNumber}: Ticket\n\nSandcastle-Ticket: #${opts.ticketNumber}`,
    ticketTip,
  );
  await git(repoDir, "branch", "-D", `sandcastle/ticket-${opts.ticketNumber}`);
  const initialHeadSha = await git(repoDir, "rev-parse", "HEAD");
  if (opts.pushInitialSpecBranch) {
    await git(repoDir, "push", "-q", "-u", "origin", specBranch);
  }
  // Leave main repo on main so specBranch can be checked out in a dedicated worktree.
  await git(repoDir, "checkout", "-q", "main");

  const ghCalls: string[][] = [];
  const phaseCalls: { runId: string; readonly: boolean; prompt: string }[] = [];
  const removedReadyLabels: number[] = [];
  const pausedCalls: { spec: number; reason: string }[] = [];
  let nowMs = 1_000_000;

  const gitExec: ExecFn = async (file, args, cwd) => {
    if (file === "git" && args[0] === "remote" && args[1] === "get-url") {
      return `https://github.com/${REPO}.git`;
    }
    return runCommand(file, args, cwd);
  };

  const makeSpecGraphqlPayload = (specReady = true) =>
    JSON.stringify({
      data: {
        repository: {
          issue: {
            number: opts.specNumber,
            title: `Spec ${opts.specNumber}`,
            body: "Spec body",
            state: "OPEN",
            labels: {
              pageInfo: { hasNextPage: false },
              nodes: specReady ? [{ name: "type:spec" }, { name: "ready-for-agent" }] : [{ name: "type:spec" }],
            },
            comments: { pageInfo: { hasNextPage: false }, nodes: [] },
            linkedBranches: { pageInfo: { hasNextPage: false }, nodes: [] },
            subIssues: {
              pageInfo: { hasNextPage: false },
              nodes: [
                {
                  number: opts.ticketNumber,
                  title: `Ticket ${opts.ticketNumber}`,
                  body: "Ticket body",
                  state: "OPEN",
                  labels: {
                    pageInfo: { hasNextPage: false },
                    nodes: [{ name: "type:ticket" }, { name: "ready-for-agent" }],
                  },
                  comments: { pageInfo: { hasNextPage: false }, nodes: [] },
                  blockedBy: { pageInfo: { hasNextPage: false }, nodes: [] },
                },
              ],
            },
          },
        },
      },
    });

  return {
    repoDir,
    bareRemoteDir,
    specBranch,
    initialHeadSha,
    specNumber: opts.specNumber,
    ticketNumber: opts.ticketNumber,
    ghCalls,
    phaseCalls,
    removedReadyLabels,
    pausedCalls,
    clockMs: () => nowMs,
    createOptions: (cfg) => {
      const ghExec: ExecFn = async (_file, args) => {
        ghCalls.push(args);
        if (args[0] === "issue" && args[1] === "edit" && args.includes("--remove-label")) {
          removedReadyLabels.push(Number(args[2]));
          return "";
        }
        if (args[0] === "issue" && args[1] === "edit" && args.includes("--add-label")) {
          return "";
        }
        if (args[0] === "issue" && args[1] === "comment") {
          const bodyIdx = args.indexOf("--body");
          pausedCalls.push({ spec: Number(args[2]), reason: bodyIdx >= 0 ? (args[bodyIdx + 1] ?? "") : "" });
          return "";
        }
        const custom = await cfg.onGh(args);
        if (custom !== "__DEFAULT_SPEC__") return custom;
        return makeSpecGraphqlPayload(true);
      };

      const AGENT_CMD_PREFIX = "__MOCK_AGENT_PROMPT__:";
      const makeAgent = (): AgentProvider => ({
        name: "mock-agent",
        env: {},
        captureSessions: false,
        parseStreamLine: (line) => [{ type: "text", text: line }],
        buildPrintCommand: ({ prompt }) => ({ command: `${AGENT_CMD_PREFIX}${prompt}` }),
      });
      const slot = { provider: makeAgent(), instructions: "Role instructions" };

      return {
        repo: REPO,
        cwd: repoDir,
        specNumber: opts.specNumber,
        draft: cfg.draft,
        ciPollIntervalMs: cfg.ciPollIntervalMs ?? 30_000,
        ciTimeoutMs: cfg.ciTimeoutMs ?? 45 * 60_000,
        ciRunAppearanceTimeoutMs: cfg.ciRunAppearanceTimeoutMs ?? 5 * 60_000,
        ciMaxRepairs: cfg.ciMaxRepairs ?? 2,
        promptsDir: PROMPTS_DIR,
        agents: {
          light: slot,
          standard: slot,
          deep: slot,
          reviewStandards: slot,
          reviewSpec: slot,
          repair: slot,
        },
        ghExec,
        gitExec,
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
              exec: async (command, execOpts) => {
                if (!command.startsWith(AGENT_CMD_PREFIX)) {
                  if (command.includes("rev-parse --abbrev-ref HEAD")) {
                    return { exitCode: 0, stdout: `${specBranch}\n`, stderr: "" };
                  }
                  return { exitCode: 0, stdout: "", stderr: "" };
                }
                const prompt = command.slice(AGENT_CMD_PREFIX.length);
                phaseCalls.push({ runId, readonly, prompt });
                const output = cfg.onAgentPhase
                  ? await cfg.onAgentPhase({ runId, readonly, worktree, prompt })
                  : `<pr-body>\n## Summary\n\nAutomated PR\n</pr-body>\n${COMPLETE}\n`;
                for (const line of output.split(/\r?\n/)) {
                  execOpts?.onLine?.(line);
                }
                return { exitCode: 0, stdout: output, stderr: "" };
              },
              copyFileIn: async () => {},
              copyFileOut: async () => {},
              close: async () => {},
            }),
          }),
        }),
      };
    },
  };
}

async function commitFixInWorktree(
  worktree: string,
  filename: string,
  content: string,
  message: string,
): Promise<string> {
  await writeFile(join(worktree, filename), content);
  await runCommand("git", ["-c", "core.hooksPath=/dev/null", "add", filename], worktree);
  await runCommand("git", ["-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", message], worktree);
  return runCommand("git", ["rev-parse", "HEAD"], worktree);
}

describe("Option-1 remote ci-gate wait, bounded auto-repair, --draft delivery, and crash/restart resume", () => {
  test("--draft delivers immediately without polling ci-gate, cleans worktree, and removes ready-for-agent", async () => {
    const fixture = await createAfkCiFixture({ specNumber: 601, ticketNumber: 602 });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/601";

    const result = await runAfk(
      fixture.createOptions({
        draft: true,
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") return JSON.stringify([]);
          if (args[0] === "pr" && args[1] === "create") {
            expect(args).toContain("--draft");
            return prUrl;
          }
          throw new Error(`Unexpected gh call in --draft mode: ${args.join(" ")}`);
        },
      }),
    );

    expect(result.delivered).toEqual([{ spec: 601, branch: fixture.specBranch, prUrl, tickets: [602] }]);
    expect(result.paused).toEqual([]);
    expect(result.stopped).toEqual([]);
    expect(fixture.removedReadyLabels).toEqual([602, 601]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-601"))).toBe(false);
    expect(fixture.ghCalls.some((args) => args.join(" ").includes("check-runs"))).toBe(false);
    expect(fixture.ghCalls.some((args) => args[0] === "pr" && args[1] === "view")).toBe(false);
  });

  test("ignores stale-SHA green ci-gate, auto-repairs up to 2 attempts with redacted failure logs, and delivers on green", async () => {
    const fixture = await createAfkCiFixture({ specNumber: 610, ticketNumber: 611 });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/610";
    const staleSha = "1111111111111111111111111111111111111111";
    const repairCommits: string[] = [];
    const repairPrompts: string[] = [];
    let sha1PollCount = 0;

    const result = await runAfk(
      fixture.createOptions({
        ciMaxRepairs: 2,
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") return JSON.stringify([]);
          if (args[0] === "pr" && args[1] === "create") return prUrl;
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 610, url: prUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            const match = /commits\/([0-9a-f]+)\/check-runs/.exec(args[1]);
            const sha = match?.[1] ?? "";
            if (sha === fixture.initialHeadSha) {
              sha1PollCount += 1;
              if (sha1PollCount === 1) {
                // First tick: stale-SHA green ci-gate + non-ci-gate green fast + in_progress workflow check.
                return JSON.stringify({
                  total_count: 3,
                  check_runs: [
                    { id: 100, name: "ci-gate", head_sha: staleSha, status: "completed", conclusion: "success" },
                    { id: 101, name: "fast", head_sha: sha, status: "completed", conclusion: "success" },
                    { id: 102, name: "integration", head_sha: sha, status: "in_progress", conclusion: null },
                  ],
                });
              }
              return JSON.stringify({
                total_count: 1,
                check_runs: [{ id: 103, name: "ci-gate", head_sha: sha, status: "completed", conclusion: "failure" }],
              });
            }
            if (sha === repairCommits[0]) {
              return JSON.stringify({
                total_count: 1,
                check_runs: [{ id: 201, name: "ci-gate", head_sha: sha, status: "completed", conclusion: "failure" }],
              });
            }
            if (sha === repairCommits[1]) {
              // Worktree must STILL exist before ci-gate turns green!
              expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-610"))).toBe(true);
              return JSON.stringify({
                total_count: 1,
                check_runs: [{ id: 301, name: "ci-gate", head_sha: sha, status: "completed", conclusion: "success" }],
              });
            }
            return JSON.stringify({ total_count: 0, check_runs: [] });
          }
          if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
            const match = /head_sha=([0-9a-f]+)/.exec(args[1]);
            const sha = match?.[1] ?? "";
            return JSON.stringify({
              workflow_runs: [{ id: 901, name: "CI", head_sha: sha, status: "completed", conclusion: "failure" }],
            });
          }
          if (args[0] === "run" && args[1] === "view") {
            return "Authorization: Bearer leaked_ci_token_999\nPOSTGRES_PASSWORD=leaked_db_pwd\nError: assertion failed in integration suite\n";
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
        onAgentPhase: async ({ runId, worktree, prompt }) => {
          if (runId.includes("-repair-ci-")) {
            repairPrompts.push(prompt);
            const idx = repairCommits.length + 1;
            const sha = await commitFixInWorktree(
              worktree,
              `ci-fix-${idx}.txt`,
              `fix ${idx}\n`,
              `fix(ci): attempt ${idx}`,
            );
            repairCommits.push(sha);
            return `Fixed attempt ${idx}\n${COMPLETE}\n`;
          }
          return `<pr-body>\n## Summary\n\nReady PR\n</pr-body>\n${COMPLETE}\n`;
        },
      }),
    );

    expect(result.delivered).toEqual([{ spec: 610, branch: fixture.specBranch, prUrl, tickets: [611] }]);
    expect(result.paused).toEqual([]);
    expect(sha1PollCount).toBe(2);
    expect(repairCommits).toHaveLength(2);
    expect(repairPrompts).toHaveLength(2);
    expect(repairPrompts[0]).toContain("Error: assertion failed in integration suite");
    expect(repairPrompts[0]).not.toContain("leaked_ci_token_999");
    expect(repairPrompts[0]).not.toContain("leaked_db_pwd");
    expect(fixture.removedReadyLabels).toEqual([611, 610]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-610"))).toBe(false);

    // Remote branch tip must equal the 2nd repair commit SHA.
    const remoteRef = await runCommand(
      "git",
      ["ls-remote", "--heads", "origin", `refs/heads/${fixture.specBranch}`],
      fixture.repoDir,
    );
    expect(remoteRef.trim()).toBe(`${repairCommits[1]}\trefs/heads/${fixture.specBranch}`);
  });

  test("pauses Spec with needs-attention and preserves worktree after exhausting ciMaxRepairs = 2", async () => {
    const fixture = await createAfkCiFixture({ specNumber: 620, ticketNumber: 621 });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/620";
    let repairCount = 0;

    const result = await runAfk(
      fixture.createOptions({
        ciMaxRepairs: 2,
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") return JSON.stringify([]);
          if (args[0] === "pr" && args[1] === "create") return prUrl;
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 620, url: prUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            const sha = /commits\/([0-9a-f]+)\/check-runs/.exec(args[1])?.[1] ?? "";
            return JSON.stringify({
              total_count: 1,
              check_runs: [
                { id: 500 + repairCount, name: "ci-gate", head_sha: sha, status: "completed", conclusion: "failure" },
              ],
            });
          }
          if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
            const sha = /head_sha=([0-9a-f]+)/.exec(args[1])?.[1] ?? "";
            return JSON.stringify({
              workflow_runs: [
                { id: 700 + repairCount, name: "CI", head_sha: sha, status: "completed", conclusion: "failure" },
              ],
            });
          }
          if (args[0] === "run" && args[1] === "view") return "persistent failure";
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
        onAgentPhase: async ({ runId, worktree }) => {
          if (runId.includes("-repair-ci-")) {
            repairCount += 1;
            await commitFixInWorktree(
              worktree,
              `attempt-${repairCount}.txt`,
              `${repairCount}\n`,
              `fix attempt ${repairCount}`,
            );
            return `${COMPLETE}\n`;
          }
          return `<pr-body>\n## Summary\n\nPR\n</pr-body>\n${COMPLETE}\n`;
        },
      }),
    );

    expect(repairCount).toBe(2);
    expect(result.delivered).toEqual([]);
    expect(result.paused).toHaveLength(1);
    expect(result.paused[0]?.reason).toContain("自动修红上限（2 次）");
    expect(fixture.pausedCalls).toHaveLength(1);
    expect(fixture.removedReadyLabels).toEqual([]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-620"))).toBe(true);
  });

  test("idempotently resumes straight into ci-gate loop when all tickets are integrated and open Ready PR already exists", async () => {
    const fixture = await createAfkCiFixture({
      specNumber: 630,
      ticketNumber: 631,
      pushInitialSpecBranch: true,
    });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/630";

    const result = await runAfk(
      fixture.createOptions({
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 630,
                url: prUrl,
                body: "Existing PR\n\nCloses #630\nCloses #631\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: fixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 630, url: prUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            const sha = /commits\/([0-9a-f]+)\/check-runs/.exec(args[1])?.[1] ?? "";
            expect(sha).toBe(fixture.initialHeadSha);
            return JSON.stringify({
              total_count: 1,
              check_runs: [{ id: 801, name: "ci-gate", head_sha: sha, status: "completed", conclusion: "success" }],
            });
          }
          throw new Error(`Unexpected gh call during resume: ${args.join(" ")}`);
        },
      }),
    );

    expect(result.delivered).toEqual([{ spec: 630, branch: fixture.specBranch, prUrl, tickets: [631] }]);
    expect(fixture.phaseCalls).toEqual([]);
    expect(fixture.removedReadyLabels).toEqual([631, 630]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-630"))).toBe(false);
  });

  test("soft-stops into result.stopped when Spec authorization is revoked during ci-gate wait", async () => {
    const fixture = await createAfkCiFixture({
      specNumber: 640,
      ticketNumber: 641,
      pushInitialSpecBranch: true,
    });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/640";
    let authChecks = 0;

    const result = await runAfk(
      fixture.createOptions({
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") {
            const queryArg = args.find((a) => a.startsWith("query=")) ?? "";
            if (!queryArg.includes("subIssues")) {
              authChecks += 1;
              const authorized = authChecks === 1;
              return JSON.stringify({
                data: {
                  repository: {
                    issue: {
                      state: "OPEN",
                      labels: {
                        pageInfo: { hasNextPage: false },
                        nodes: authorized
                          ? [{ name: "type:spec" }, { name: "ready-for-agent" }]
                          : [{ name: "type:spec" }],
                      },
                    },
                  },
                },
              });
            }
            return "__DEFAULT_SPEC__";
          }
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 640,
                url: prUrl,
                body: "Closes #640\nCloses #641\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: fixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 640, url: prUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            return JSON.stringify({
              total_count: 1,
              check_runs: [
                { id: 1, name: "ci-gate", head_sha: fixture.initialHeadSha, status: "in_progress", conclusion: null },
              ],
            });
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
      }),
    );

    expect(result.stopped).toEqual([640]);
    expect(result.paused).toEqual([]);
    expect(result.delivered).toEqual([]);
    expect(fixture.pausedCalls).toEqual([]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-640"))).toBe(true);
  });

  test("pauses cleanly when PR is externally closed during ci-gate wait", async () => {
    const fixture = await createAfkCiFixture({
      specNumber: 650,
      ticketNumber: 651,
      pushInitialSpecBranch: true,
    });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/650";
    let prViewCalls = 0;

    const result = await runAfk(
      fixture.createOptions({
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 650,
                url: prUrl,
                body: "Closes #650\nCloses #651\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: fixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            prViewCalls += 1;
            return JSON.stringify({
              number: 650,
              url: prUrl,
              state: prViewCalls === 1 ? "OPEN" : "CLOSED",
              isDraft: false,
            });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            return JSON.stringify({
              total_count: 1,
              check_runs: [
                { id: 1, name: "ci-gate", head_sha: fixture.initialHeadSha, status: "queued", conclusion: null },
              ],
            });
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
      }),
    );

    expect(result.paused).toHaveLength(1);
    expect(result.paused[0]?.reason).toContain("CLOSED");
    expect(result.delivered).toEqual([]);
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-650"))).toBe(true);
  });

  test("pauses with needs-attention on missing-run timeout and on overall ci-gate poll timeout", async () => {
    // 1. Missing-run timeout (workflow never triggers for headSha).
    const missingFixture = await createAfkCiFixture({
      specNumber: 660,
      ticketNumber: 661,
      pushInitialSpecBranch: true,
    });
    const missingPrUrl = "https://github.com/cyy1998/shgas-iam/pull/660";
    const missingResult = await runAfk(
      missingFixture.createOptions({
        ciPollIntervalMs: 30_000,
        ciRunAppearanceTimeoutMs: 60_000,
        ciTimeoutMs: 600_000,
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 660,
                url: missingPrUrl,
                body: "Closes #660\nCloses #661\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: missingFixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 660, url: missingPrUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            return JSON.stringify({ total_count: 0, check_runs: [] });
          }
          if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
            return JSON.stringify({ workflow_runs: [] });
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
      }),
    );
    expect(missingResult.paused).toHaveLength(1);
    expect(missingResult.paused[0]?.reason).toContain("触发远端 ci-gate 超时");
    expect(missingFixture.clockMs()).toBe(1_060_000);

    // 2. Overall poll timeout while workflow stays actively in_progress past ciRunAppearanceTimeoutMs.
    const timeoutFixture = await createAfkCiFixture({
      specNumber: 670,
      ticketNumber: 671,
      pushInitialSpecBranch: true,
    });
    const timeoutPrUrl = "https://github.com/cyy1998/shgas-iam/pull/670";
    const timeoutResult = await runAfk(
      timeoutFixture.createOptions({
        ciPollIntervalMs: 30_000,
        ciRunAppearanceTimeoutMs: 60_000,
        ciTimeoutMs: 120_000,
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 670,
                url: timeoutPrUrl,
                body: "Closes #670\nCloses #671\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: timeoutFixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 670, url: timeoutPrUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            return JSON.stringify({ total_count: 0, check_runs: [] });
          }
          if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
            return JSON.stringify({
              workflow_runs: [
                {
                  id: 88,
                  name: "CI",
                  head_sha: timeoutFixture.initialHeadSha,
                  status: "in_progress",
                  conclusion: null,
                },
              ],
            });
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
      }),
    );
    expect(timeoutResult.paused).toHaveLength(1);
    expect(timeoutResult.paused[0]?.reason).toContain("完成超时");
    expect(timeoutFixture.clockMs()).toBe(1_120_000);
  });

  test("pauses cleanly when repair-ci agent exits COMPLETE without creating a new commit", async () => {
    const fixture = await createAfkCiFixture({
      specNumber: 680,
      ticketNumber: 681,
      pushInitialSpecBranch: true,
    });
    const prUrl = "https://github.com/cyy1998/shgas-iam/pull/680";

    const result = await runAfk(
      fixture.createOptions({
        onGh: (args) => {
          if (args[0] === "api" && args[1] === "graphql") return "__DEFAULT_SPEC__";
          if (args[0] === "pr" && args[1] === "list") {
            return JSON.stringify([
              {
                number: 680,
                url: prUrl,
                body: "Closes #680\nCloses #681\n",
                state: "OPEN",
                isDraft: false,
                isCrossRepository: false,
                headRefName: fixture.specBranch,
                baseRefName: "main",
              },
            ]);
          }
          if (args[0] === "pr" && args[1] === "view") {
            return JSON.stringify({ number: 680, url: prUrl, state: "OPEN", isDraft: false });
          }
          if (args[0] === "api" && args[1]?.includes("/check-runs")) {
            return JSON.stringify({
              total_count: 1,
              check_runs: [
                {
                  id: 9,
                  name: "ci-gate",
                  head_sha: fixture.initialHeadSha,
                  status: "completed",
                  conclusion: "failure",
                },
              ],
            });
          }
          if (args[0] === "api" && args[1]?.includes("/actions/runs?head_sha=")) {
            return JSON.stringify({ workflow_runs: [] });
          }
          throw new Error(`Unexpected gh call: ${args.join(" ")}`);
        },
        onAgentPhase: async () => `No commit created\n${COMPLETE}\n`,
      }),
    );

    expect(result.paused).toHaveLength(1);
    expect(result.paused[0]?.reason).toContain("未产生新提交");
    expect(existsSync(join(fixture.repoDir, ".sandcastle", "worktrees", "spec-680"))).toBe(true);
  });
});
