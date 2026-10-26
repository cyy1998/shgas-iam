import { join } from "node:path";
import type { FinalizationRun } from "./finalization.ts";
import { githubRepo } from "./github.ts";
import { assertTicketIssuesOpen, createWorkspaceExecutor, type ExecutorOptions } from "./ticket-runtime.mts";

export function createFinalizationExecutor(options: ExecutorOptions): FinalizationRun {
  const execute = createWorkspaceExecutor(options);
  return async ({ phase, workspace, tickets, reviewBase, reviewCandidate, reviewReport }) => {
    // Preserve the highest implementation risk selected for this Spec; review coordination uses the caller's model.
    const implementer = tickets.some((entry) => entry.ticket.implementer === "implementer_deep")
      ? options.roles.implementer_deep
      : options.roles.implementer_standard;
    const result = await execute({
      worktreePath: workspace.worktreePath,
      role: phase === "review" ? undefined : implementer,
      name: `Spec #${workspace.graph.spec.number} ${phase}`,
      promptFile: join(options.cwd, ".sandcastle", `spec-${phase}-prompt.md`),
      promptArgs: {
        REPO: githubRepo,
        SPEC_NUMBER: String(workspace.graph.spec.number),
        INVOCATION_BRANCH: workspace.invocationBranch,
        INTEGRATION_BRANCH: workspace.branch,
        REVIEW_BASE: reviewBase,
        REVIEW_CANDIDATE: reviewCandidate,
        TICKETS: tickets
          .map(
            (entry) =>
              `#${entry.ticket.number} (${entry.ticket.title})；base ${entry.baseSha}；candidate ${entry.candidate}；merged ${entry.mergedSha}\n` +
              `实施：${entry.handoff}\n票级验收：${entry.acceptance}`,
          )
          .join("\n\n"),
        ...(phase === "repair-and-verify" ? { REVIEW_REPORT: reviewReport ?? "缺少双轴报告，保持未完成。" } : {}),
      },
      logName: `spec-${workspace.graph.spec.number}-${phase}`,
    });
    await assertTicketIssuesOpen(
      options.cwd,
      [workspace.graph.spec.number, ...tickets.map((entry) => entry.ticket.number)],
      options.runGh,
    );
    return result;
  };
}
