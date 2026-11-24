import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "./commands.ts";
import { ExecutorInfrastructureError } from "./resources.ts";
import type { IssueTracker, TrackedIssue } from "./specs.ts";

export const githubRepo = "cyy1998/shgas-iam";
const prJsonFields = "number,url,state,baseRefName,headRefName,headRefOid,mergeCommit,isDraft";

export type PullRequestInfo = {
  number: number;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeCommitOid: string | null;
  isDraft: boolean;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub 返回无效数据。");
  return value as Record<string, unknown>;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("GitHub 返回无效编号。");
  return value;
}

function names(value: unknown, key: string): string[] {
  if (!Array.isArray(value)) throw new Error("GitHub 返回无效标签或认领数据。");
  return value.map((entry) => {
    const name = record(entry)[key];
    if (typeof name !== "string" || !name.trim()) throw new Error("GitHub 返回无效标签或认领数据。");
    return name;
  });
}

function sha(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) throw new Error(`GitHub 返回无效 ${label} SHA。`);
  return value;
}

export function parsePullRequest(value: unknown): PullRequestInfo {
  const item = record(value);
  const prNumber = number(item.number);
  const url = item.url;
  const state = item.state;
  const baseRefName = item.baseRefName;
  const headRefName = item.headRefName;
  const isDraft = item.isDraft;
  if (
    typeof url !== "string" ||
    !url.trim() ||
    (state !== "OPEN" && state !== "CLOSED" && state !== "MERGED") ||
    typeof baseRefName !== "string" ||
    !baseRefName.trim() ||
    typeof headRefName !== "string" ||
    !headRefName.trim() ||
    typeof isDraft !== "boolean"
  ) {
    throw new Error("GitHub 返回无效 Pull Request 数据。");
  }
  let mergeCommitOid: string | null = null;
  if (item.mergeCommit !== null && item.mergeCommit !== undefined) {
    const mergeCommit = record(item.mergeCommit);
    mergeCommitOid = sha(mergeCommit.oid, "mergeCommit");
  }
  return {
    number: prNumber,
    url: url.trim(),
    state,
    baseRefName: baseRefName.trim(),
    headRefName: headRefName.trim(),
    headRefOid: sha(item.headRefOid, "headRefOid"),
    mergeCommitOid,
    isDraft,
  };
}

export function matchesGitHubRepoUrl(url: string): boolean {
  const normalized = url.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  return new RegExp(`(?:^|[:/])${githubRepo}(?:\\.git)?$`, "i").test(normalized);
}

export async function resolveGitRemote(cwd: string, invocationBranch: string, override?: string): Promise<string> {
  const remotes = (await command("git", ["remote"], cwd))
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!remotes.length) throw new Error(`当前仓库未配置指向 ${githubRepo} 的 Git remote。`);
  const inspectUrl = async (name: string) => {
    const fetchUrl = await command("git", ["remote", "get-url", name], cwd);
    const pushUrl = await command("git", ["remote", "get-url", "--push", name], cwd).catch(() => fetchUrl);
    return { fetchUrl, pushUrl };
  };
  const explicit = override?.trim();
  if (explicit) {
    if (!remotes.includes(explicit)) throw new Error(`SANDCASTLE_GIT_REMOTE 指定的 remote 不存在：${explicit}。`);
    const { fetchUrl, pushUrl } = await inspectUrl(explicit);
    if (!matchesGitHubRepoUrl(fetchUrl) || !matchesGitHubRepoUrl(pushUrl)) {
      throw new Error(`remote ${explicit} 未指向 ${githubRepo}：${pushUrl}。`);
    }
    return explicit;
  }
  const tracked = await command("git", ["config", "--get", `branch.${invocationBranch}.remote`], cwd).catch(() => "");
  if (tracked && remotes.includes(tracked)) {
    const { fetchUrl, pushUrl } = await inspectUrl(tracked);
    if (matchesGitHubRepoUrl(fetchUrl) && matchesGitHubRepoUrl(pushUrl)) return tracked;
  }
  const matched: string[] = [];
  for (const name of remotes) {
    const { fetchUrl, pushUrl } = await inspectUrl(name);
    if (matchesGitHubRepoUrl(fetchUrl) && matchesGitHubRepoUrl(pushUrl)) matched.push(name);
  }
  if (matched.length === 1) return matched[0]!;
  if (matched.length > 1) {
    throw new Error(
      `发现多个指向 ${githubRepo} 的 remote（${matched.join("、")}），请通过 SANDCASTLE_GIT_REMOTE 明确指定。`,
    );
  }
  throw new Error(`未找到指向 ${githubRepo} 的 Git remote，请检查 git remote 或配置 SANDCASTLE_GIT_REMOTE。`);
}

export async function findOpenPullRequests(
  cwd: string,
  headBranch: string,
  baseBranch: string,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<PullRequestInfo[]> {
  try {
    const stdout = await runGh([
      "pr",
      "list",
      "--repo",
      githubRepo,
      "--state",
      "open",
      "--head",
      headBranch,
      "--base",
      baseBranch,
      "--json",
      prJsonFields,
    ]);
    const list: unknown = JSON.parse(stdout);
    if (!Array.isArray(list)) throw new Error("GitHub 返回无效 PR 列表。");
    return list.map(parsePullRequest);
  } catch (cause) {
    throw new ExecutorInfrastructureError(`查询 ${headBranch} -> ${baseBranch} 的 Open PR 失败，停止运行并保留现场。`, {
      cause,
    });
  }
}

export async function readPullRequest(
  cwd: string,
  prNumber: number,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<PullRequestInfo> {
  try {
    const stdout = await runGh(["pr", "view", String(prNumber), "--repo", githubRepo, "--json", prJsonFields]);
    const pr = parsePullRequest(JSON.parse(stdout));
    if (pr.number !== prNumber) throw new Error(`PR 编号不匹配：期望 #${prNumber}，实际 #${pr.number}。`);
    return pr;
  } catch (cause) {
    throw new ExecutorInfrastructureError(`读取 GitHub PR #${prNumber} 失败，停止运行并保留现场。`, { cause });
  }
}

export async function createPullRequest(
  cwd: string,
  input: { base: string; head: string; title: string; body: string; draft?: boolean },
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<PullRequestInfo> {
  const directory = await mkdtemp(join(tmpdir(), "iam-afk-pr-"));
  try {
    const bodyPath = join(directory, "pr-body.md");
    await writeFile(bodyPath, input.body, "utf8");
    const args = [
      "pr",
      "create",
      "--repo",
      githubRepo,
      "--base",
      input.base,
      "--head",
      input.head,
      "--title",
      input.title,
      "--body-file",
      bodyPath,
      ...(input.draft ? ["--draft"] : []),
    ];
    let stdout: string;
    try {
      stdout = await runGh(args);
    } catch (cause) {
      throw new ExecutorInfrastructureError(
        `创建 GitHub PR (${input.head} -> ${input.base}) 失败，保留分支与工作树。`,
        { cause },
      );
    }
    const urlNumber = new RegExp(`https://github\\.com/${githubRepo}/pull/([1-9]\\d*)`).exec(stdout)?.[1];
    if (urlNumber) return readPullRequest(cwd, Number(urlNumber), runGh);
    const open = await findOpenPullRequests(cwd, input.head, input.base, runGh);
    if (open.length === 1) return open[0]!;
    throw new ExecutorInfrastructureError(
      `PR 创建命令已返回，但无法唯一核验 ${input.head} -> ${input.base} 的 Open PR，保留现场。`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function removeIssueLabel(
  cwd: string,
  issueNumber: number,
  label: string,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): Promise<void> {
  try {
    const readLabels = async () => {
      const data = record(
        JSON.parse(
          await runGh(["issue", "view", String(issueNumber), "--repo", githubRepo, "--json", "number,labels"]),
        ),
      );
      if (number(data.number) !== issueNumber) throw new Error(`#${issueNumber} 的标签查询返回错误编号。`);
      return names(data.labels, "name");
    };
    const before = await readLabels();
    if (before.includes(label)) {
      await runGh(["issue", "edit", String(issueNumber), "--repo", githubRepo, "--remove-label", label]);
    }
    const after = await readLabels();
    if (after.includes(label)) throw new Error(`#${issueNumber} 仍保留标签 ${label}。`);
  } catch (cause) {
    throw new ExecutorInfrastructureError(`GitHub #${issueNumber} 移除标签 ${label} 失败，请先核对实际 issue 状态。`, {
      cause,
    });
  }
}

export function createGitHubIssueTracker(
  cwd: string,
  runGh: (args: string[]) => Promise<string> = (args) => command("gh", args, cwd),
): IssueTracker {
  async function pages(path: string): Promise<unknown[]> {
    const pages: unknown = JSON.parse(await runGh(["api", path, "--paginate", "--slurp"]));
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
      throw new Error("GitHub 返回无效分页数据。");
    return pages.flat();
  }
  async function pageNumbers(path: string): Promise<number[]> {
    return (await pages(path))
      .filter((entry) => !record(entry).pull_request)
      .map((entry) => {
        const item = record(entry);
        if (
          typeof item.repository_url === "string" &&
          item.repository_url !== `https://api.github.com/repos/${githubRepo}`
        )
          throw new Error("GitHub 关系指向其他仓库；保留为阻塞，不能用本仓库同编号 issue 替代。");
        return number(item.number);
      });
  }

  async function readIssue(issueNumber: number): Promise<TrackedIssue> {
    const [stdout, blockers, issueComments] = await Promise.all([
      runGh([
        "issue",
        "view",
        String(issueNumber),
        "--repo",
        githubRepo,
        "--json",
        "number,title,body,state,labels,assignees,parent",
      ]),
      pageNumbers(`repos/${githubRepo}/issues/${issueNumber}/dependencies/blocked_by?per_page=100`),
      pages(`repos/${githubRepo}/issues/${issueNumber}/comments?per_page=100`),
    ]);
    const issue = record(JSON.parse(stdout));
    if (
      number(issue.number) !== issueNumber ||
      typeof issue.title !== "string" ||
      typeof issue.body !== "string" ||
      (issue.state !== "OPEN" && issue.state !== "CLOSED")
    )
      throw new Error("GitHub 返回无效 issue 内容。");
    const parent = issue.parent ? record(issue.parent) : undefined;
    const parentNumber = parent ? number(parent.number) : null;
    const parentMatches = !parent?.url || parent.url === `https://github.com/${githubRepo}/issues/${parentNumber}`;
    return {
      number: issueNumber,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: names(issue.labels, "name"),
      assignees: names(issue.assignees, "login"),
      parent: parentMatches ? parentNumber : null,
      blockers,
      comments: issueComments.map((entry) => {
        const item = record(entry);
        const user = record(item.user);
        if (typeof item.body !== "string" || typeof user.login !== "string" || !user.login.trim())
          throw new Error("GitHub 返回无效普通评论。");
        return { body: item.body, author: user.login };
      }),
    };
  }

  return {
    listSpecs: async () =>
      Promise.all(
        (await pageNumbers(`repos/${githubRepo}/issues?state=open&labels=type%3Aspec&per_page=100`)).map(readIssue),
      ),
    readIssue,
    readChildren: (issueNumber) => pageNumbers(`repos/${githubRepo}/issues/${issueNumber}/sub_issues?per_page=100`),
  };
}
