import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Worktree } from "@ai-hero/sandcastle";
import { command } from "./command.ts";
import type { createGitWorkspace, IntegrationEvidence } from "./git.ts";
import type { createGitHubIssueTracker, RunGh, SpecGraph } from "./github.ts";
import type { ReportProjectStage } from "./projects.ts";
import { createSpecState, type DeliveryEvidence } from "./state.ts";

const fields = "number,url,state,headRefName,baseRefName,headRefOid,isCrossRepository";
const maxBody = 60_000;

type PullRequest = {
  number: number;
  url: string;
  state: string;
  headRefName: string;
  baseRefName: string;
  headRefOid: string;
  isCrossRepository: boolean;
};

async function withBody<T>(body: string, use: (path: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "sandcastle-body-"));
  try {
    const path = join(directory, "body.md");
    await writeFile(path, body, { mode: 0o600, flag: "wx" });
    return await use(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function buildBody(
  graph: SpecGraph,
  integrated: ReadonlyMap<number, IntegrationEvidence>,
  base: string,
  branch: string,
  head: string,
  evidence: DeliveryEvidence,
) {
  const numbers = [graph.spec.number, ...graph.tickets.map(({ number }) => number)];
  const table = graph.tickets.map(
    ({ number, title }) =>
      `| #${number} | ${title.replaceAll("|", "\\|").replaceAll("\n", " ")} | \`${integrated.get(number)?.mergeSha}\` |`,
  );
  const linksAndTable = [
    ...numbers.map((number) => `Closes #${number}`),
    "",
    "## Integrated Tickets",
    "",
    "| Ticket | Title | Merge commit |",
    "| --- | --- | --- |",
    ...table,
  ].join("\n");
  const metadata = [
    "---",
    `Spec: #${graph.spec.number}`,
    `Base-Branch: ${base}`,
    `Head-Branch: ${branch}`,
    `Review-Base: ${evidence.reviewBase}`,
    `Review-Candidate: ${evidence.reviewCandidate}`,
    `Final-Candidate: ${head}`,
  ].join("\n");
  const open = "<details>\n<summary>AFK review and final verification</summary>\n\n";
  const close = "\n\n</details>";
  const detail = `${evidence.reviewReport}\n\n### Repair and verification\n\n${evidence.repairSummary}`;
  const budget = maxBody - linksAndTable.length - metadata.length - open.length - close.length - 6;
  if (budget < 1) throw new Error("The mandatory PR metadata exceeds the body budget.");
  function fit(text: string, limit: number) {
    if (text.length <= limit) return text;
    const note = "\n\n[Truncated]";
    return limit <= note.length ? text.slice(0, limit) : text.slice(0, limit - note.length) + note;
  }
  const draft = fit(evidence.prBody, budget);
  const details = fit(detail, budget - draft.length);
  return [draft, linksAndTable, open + details + close, metadata].join("\n\n");
}

export function createDelivery(options: {
  cwd: string;
  repo: string;
  remote: string;
  invocation: { branch: string; worktreePath: string };
  invocationBase: string;
  actor: string;
  draft: boolean;
  git: ReturnType<typeof createGitWorkspace>;
  gh: RunGh;
  tracker: ReturnType<typeof createGitHubIssueTracker>;
  project: ReportProjectStage;
  signal?: AbortSignal;
}) {
  const { cwd, repo, remote, invocation, invocationBase, actor, git, gh, tracker, project, signal } = options;
  function verifyPr(pr: PullRequest, branch: string, head: string) {
    if (
      !Number.isSafeInteger(pr.number) ||
      pr.number < 1 ||
      !pr.url ||
      pr.isCrossRepository !== false ||
      pr.state !== "OPEN" ||
      pr.baseRefName !== invocation.branch ||
      pr.headRefName !== branch ||
      pr.headRefOid !== head
    ) {
      throw new Error(`Open PR for ${branch} does not match the verified candidate ${head}.`);
    }
    return pr;
  }
  async function openPr(branch: string, head: string): Promise<PullRequest | undefined> {
    const matches: PullRequest[] = JSON.parse(
      await gh([
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--head",
        branch,
        "--base",
        invocation.branch,
        "--limit",
        "100",
        "--json",
        fields,
      ]),
    );
    if (matches.length > 1) throw new Error(`Multiple open PRs for ${branch} target ${invocation.branch}.`);
    if (matches[0]) return verifyPr(matches[0], branch, head);
  }
  async function remoteTip(branch: string) {
    const lines = await command("git", ["ls-remote", "--heads", "--", remote, `refs/heads/${branch}`], cwd);
    const [sha, ref] = lines.split("\t");
    if (lines && (ref !== `refs/heads/${branch}` || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sha ?? ""))) {
      throw new Error(`Could not verify remote branch ${branch}.`);
    }
    return sha || undefined;
  }
  async function recordComment(number: number, body: string) {
    const comments = await gh([
      "api",
      `repos/${repo}/issues/${number}/comments?per_page=100`,
      "--paginate",
      "--jq",
      ".[] | @json",
    ]);
    const exists = comments
      .split("\n")
      .filter(Boolean)
      .some((line) => {
        const comment: { user?: { login: string }; body?: string } = JSON.parse(line);
        return comment.user?.login === actor && comment.body === body;
      });
    if (!exists)
      await withBody(body, (path) => gh(["issue", "comment", String(number), "--repo", repo, "--body-file", path]));
  }
  return {
    openPr,
    recordComment,
    async deliver(input: {
      graph: SpecGraph;
      workspace: Worktree;
      head: string;
      integrated: ReadonlyMap<number, IntegrationEvidence>;
      ticketBranches: ReadonlyMap<number, string>;
      evidence?: DeliveryEvidence;
      existingPr?: PullRequest;
    }) {
      const { graph, workspace, head, integrated, ticketBranches, evidence } = input;
      const { branch } = workspace;
      async function assertCandidate() {
        signal?.throwIfAborted();
        if ((await git.observe(invocation)) !== invocationBase || (await git.observe(workspace)) !== head) {
          throw new Error("Invocation or Spec candidate changed. Preserve the worktrees.");
        }
        const progress = await git.inspectTickets(head, invocationBase, ticketBranches);
        if (
          graph.tickets.some(
            ({ number }) =>
              progress.integrated.get(number)?.mergeSha !== integrated.get(number)?.mergeSha ||
              !progress.integrated.has(number),
          )
        ) {
          throw new Error("Ticket integration evidence changed. Preserve the worktrees.");
        }
      }

      await assertCandidate();
      if ((await remoteTip(invocation.branch)) !== invocationBase) {
        throw new Error(`Remote invocation branch ${invocation.branch} moved. Synchronize it before continuing.`);
      }
      const remoteHead = await remoteTip(branch);
      let pr = input.existingPr;
      if (pr && remoteHead !== head) throw new Error(`Remote branch ${branch} does not match open PR #${pr.number}.`);
      if (!pr && remoteHead !== head) {
        if (!evidence) throw new Error("Final verification evidence is missing.");
        // Pin the source object and let Git enforce fast-forward semantics on the remote ref.
        await command(
          "git",
          ["push", "--no-follow-tags", "--", remote, `${head}:refs/heads/${branch}`],
          workspace.worktreePath,
        );
      }
      if ((await remoteTip(branch)) !== head) throw new Error(`Remote branch ${branch} changed during delivery.`);
      await command("git", ["fetch", "--no-tags", "--", remote, `refs/heads/${branch}`], cwd);
      await command("git", ["branch", "--set-upstream-to", `${remote}/${branch}`, branch], workspace.worktreePath);

      await assertCandidate();
      pr ??= await openPr(branch, head);
      if (!pr) {
        if (!evidence) throw new Error("Final verification evidence is missing.");
        const body = buildBody(graph, integrated, invocation.branch, branch, head, evidence);
        await withBody(body, (path) =>
          gh([
            "pr",
            "create",
            "--repo",
            repo,
            "--base",
            invocation.branch,
            "--head",
            branch,
            "--title",
            `Spec #${graph.spec.number}: ${graph.spec.title}`,
            "--body-file",
            path,
            ...(options.draft ? ["--draft"] : []),
          ]),
        );
        pr = await openPr(branch, head);
      }
      if (!pr) throw new Error("The newly created PR is not visible. Keep the verified candidate for recovery.");
      pr = verifyPr(
        JSON.parse(await gh(["pr", "view", String(pr.number), "--repo", repo, "--json", fields])),
        branch,
        head,
      );
      // Record the confirmed PR before removing the first label, even when a prior cache was unavailable.
      await createSpecState(cwd, graph.spec.number).saveOpenPr(head, pr.number);

      const summary = [
        `Spec #${graph.spec.number} is ready for review in ${pr.url}.`,
        `Verified candidate \`${head}\` targeting \`${invocation.branch}\`.`,
        `${integrated.size} ticket(s) have verified Git merge evidence. See the pull request for final verification details.`,
      ].join("\n\n");
      for (const { number } of [graph.spec, ...graph.tickets]) {
        signal?.throwIfAborted();
        const issue = await tracker.readIssue(number);
        if (issue.state !== "OPEN") throw new Error(`Issue #${number} closed during delivery.`);
        await recordComment(number, summary);
        if (issue.labels.includes("ready-for-agent")) {
          await gh(["issue", "edit", String(number), "--repo", repo, "--remove-label", "ready-for-agent"]);
          if ((await tracker.readIssue(number)).labels.includes("ready-for-agent")) {
            throw new Error(`Could not confirm removal of the ready label for #${number}.`);
          }
        }
        await project(number, "PR Open", true);
      }

      await assertCandidate();
      if ((await remoteTip(branch)) !== head) throw new Error(`Remote branch ${branch} changed before cleanup.`);
      for (const [number, value] of integrated) {
        signal?.throwIfAborted();
        const ticketBranch = ticketBranches.get(number);
        if (!ticketBranch) throw new Error(`Missing managed branch for #${number}.`);
        await git.closeTicket(ticketBranch, value.candidate);
      }
      await git.close(workspace, head);
      if ((await git.branchTip(branch)) !== head || (await git.observe(invocation)) !== invocationBase) {
        throw new Error("Cleanup could not confirm the retained Spec and invocation branch tips.");
      }
      return pr;
    },
  };
}
