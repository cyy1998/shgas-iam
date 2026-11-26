import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBindMountSandboxProvider, type MountConfig } from "@ai-hero/sandcastle";
import { extractTag, hasStandaloneCompletion } from "../afk.ts";
import {
  branchExists,
  parseGitHubRepoUrl,
  preflightCredentials,
  runCommand,
  verifyGitRemote,
  verifyMergeCommit,
} from "../git.ts";
import {
  ensureClosesLines,
  findBlockingOpenTickets,
  listReadySpecNumbers,
  readSpec,
  resolveSpecBranch,
  upsertPullRequest,
} from "../github.ts";
import { parsePositiveInt } from "../run.mts";
import { createRepoSessionFactory, stageCodexAuth, verifyContainerStopped } from "../session.ts";

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
    const nums = await listReadySpecNumbers("cyy1998/shgas-iam", process.cwd(), async (_file, args) => {
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
      listReadySpecNumbers("cyy1998/shgas-iam", process.cwd(), async () =>
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

    const defaultSpec = await readSpec("cyy1998/shgas-iam", 450, process.cwd(), async () => makePayload([]));
    expect(resolveSpecBranch(defaultSpec, "main")).toBe("sandcastle/spec-450");

    const linkedSpec = await readSpec("cyy1998/shgas-iam", 450, process.cwd(), async () =>
      makePayload(["feat/user-sync"]),
    );
    expect(resolveSpecBranch(linkedSpec, "main")).toBe("feat/user-sync");

    const mainSpec = await readSpec("cyy1998/shgas-iam", 450, process.cwd(), async () => makePayload(["main"]));
    expect(() => resolveSpecBranch(mainSpec, "release/v1")).toThrow("不得为 main");

    const multiSpec = await readSpec("cyy1998/shgas-iam", 450, process.cwd(), async () =>
      makePayload(["feat/a", "feat/b"]),
    );
    expect(() => resolveSpecBranch(multiSpec, "main")).toThrow("关联了多个分支");

    const overflowErr = await captureError(() =>
      readSpec("cyy1998/shgas-iam", 450, process.cwd(), async () => makePayload(["feat/a"], true)),
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
      repo: "cyy1998/shgas-iam",
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
      "cyy1998/shgas-iam",
      async () => "git@github.com:cyy1998/shgas-iam.git\nhttps://github.com/cyy1998/shgas-iam.git",
    );

    const badFetchErr = await captureError(() =>
      verifyGitRemote(process.cwd(), "origin", "cyy1998/shgas-iam", async (_f, args) =>
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
    expect(() => parsePositiveInt("--parallel", "abc")).toThrow("正整数");
    expect(() => parsePositiveInt("--iterations", "-1")).toThrow("正整数");
    expect(() => parsePositiveInt("--spec", "")).toThrow("正整数");
  });
});

describe("Session isolation, one-way auth staging, and container-stopped resource cleanup", () => {
  test("stages auth.json readonly and self-enforces readonly mounts in readonly sessions", async () => {
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

    const capturedProviderCalls: { mounts?: MountConfig[]; groups?: number[]; network?: string }[] = [];
    let capturedCreateMounts: MountConfig[] | undefined;
    const fakeDocker = ((opts?: { mounts?: MountConfig[]; groups?: number[]; network?: string }) => {
      capturedProviderCalls.push({ mounts: opts?.mounts, groups: opts?.groups, network: opts?.network });
      return createBindMountSandboxProvider({
        name: "fake-docker",
        create: async (createOpts) => {
          capturedCreateMounts = createOpts.mounts;
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

    const factory = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile },
      imageName: "iam-sandcastle:local",
      hostStore: join(root, "pnpm-store"),
      turboCacheDir: join(root, "turbo-cache"),
      dockerGid: 999,
      registryMount: {
        hostPath: join(root, "docker.json"),
        sandboxPath: "/home/agent/.docker/config.json",
        readonly: true,
      },
      createDockerProvider: fakeDocker,
      inspectContainer: async () => ({ exists: false, running: false }),
    });

    const ro = await factory({ worktree: wt, readonly: true, runId: "ro-1" });
    expect(ro.hooks).toBeUndefined();
    expect(capturedProviderCalls[0]?.groups).toBeUndefined();
    expect(capturedProviderCalls[0]?.network).toBeUndefined();
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

    // Calling sandbox.create directly (without any outer readonlySandbox wrapper) enforces readonly on all mounts.
    const provider = ro.sandbox as unknown as {
      create: (opts: {
        worktreePath: string;
        hostRepoPath: string;
        mounts: MountConfig[];
        env: Record<string, string>;
      }) => Promise<unknown>;
    };
    await provider.create({
      worktreePath: wt,
      hostRepoPath: root,
      mounts: [
        { hostPath: wt, sandboxPath: "/home/agent/workspace" },
        { hostPath: join(root, ".git"), sandboxPath: "/home/agent/.git", readonly: false },
      ],
      env: {},
    });
    expect(capturedCreateMounts).toHaveLength(2);
    expect(capturedCreateMounts?.every((m) => m.readonly === true)).toBe(true);
    await ro.cleanup?.();
  });

  test("preserves registry while container is running and cleans both root and worktree run-* dirs once stopped", async () => {
    const root = await makeTempDir("afk-cleanup-");
    const wt = await makeTempDir("afk-cleanup-wt-");
    const authFile = join(root, "auth.json");
    await writeFile(authFile, '{"token":"ok"}\n', { mode: 0o600 });

    let running = true;
    const inspectedIds: string[] = [];
    const fakeDocker = (() =>
      createBindMountSandboxProvider({
        name: "fake-docker",
        create: async (createOpts) => ({
          sandboxId: "sandcastle-deadbeef",
          worktreePath: createOpts.worktreePath,
          exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
          copyFileIn: async () => {},
          copyFileOut: async () => {},
          close: async () => {},
        }),
      })) as unknown as typeof import("@ai-hero/sandcastle/sandboxes/docker").docker;

    const factory = createRepoSessionFactory({
      cwd: root,
      env: { CODEX_AUTH: "chatgpt", CODEX_AUTH_FILE: authFile },
      imageName: "iam-sandcastle:local",
      hostStore: join(root, "pnpm-store"),
      turboCacheDir: join(root, "turbo-cache"),
      dockerGid: 999,
      createDockerProvider: fakeDocker,
      inspectContainer: async (id) => {
        inspectedIds.push(id);
        return { exists: running, running };
      },
    });

    const rw = await factory({ worktree: wt, readonly: false, runId: "rw-1" });
    const provider = rw.sandbox as unknown as {
      create: (opts: {
        worktreePath: string;
        hostRepoPath: string;
        mounts: MountConfig[];
        env: Record<string, string>;
      }) => Promise<unknown>;
    };
    await provider.create({
      worktreePath: wt,
      hostRepoPath: root,
      mounts: [{ hostPath: wt, sandboxPath: "/home/agent/workspace" }],
      env: {},
    });

    const runningErr = await captureError(async () => {
      await rw.cleanup?.();
    });
    expect(runningErr?.message).toContain("sandcastle-deadbeef");
    expect(inspectedIds).toEqual(["sandcastle-deadbeef"]);
    expect((await readdir(join(root, ".sandcastle", "resources"))).length).toBe(1);
    expect((await readdir(join(wt, ".sandcastle", "resources"))).length).toBe(1);

    running = false;
    await rw.cleanup?.();
    expect(await readdir(join(root, ".sandcastle", "resources"))).toEqual([]);
    expect(await readdir(join(wt, ".sandcastle", "resources"))).toEqual([]);

    const directErr = await captureError(() =>
      verifyContainerStopped("sandcastle-live", root, async () => ({ exists: true, running: true })),
    );
    expect(directErr?.message).toContain("仍在运行");
  });
});
