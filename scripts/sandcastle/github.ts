import { command } from "./commands.ts";
import type { IssueTracker, TrackedIssue } from "./specs.ts";

export const githubRepo = "cyy1998/shgas-iam";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("GitHub 返回无效 issue 数据。");
  return value as Record<string, unknown>;
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("GitHub 返回无效 issue 编号。");
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
