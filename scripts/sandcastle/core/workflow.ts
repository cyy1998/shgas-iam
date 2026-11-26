import { readFile, realpath } from "node:fs/promises";
import type { Worktree } from "@ai-hero/sandcastle";
import { command, retryGhRead } from "./command.ts";
import {
  defineSandcastleConfig,
  type ExecutionPhase,
  type PromptPhase,
  type Role,
  type SandcastleConfig,
} from "./config.ts";
import { createDelivery } from "./delivery.ts";
import { checkExecutors, completionReport, createExecutor, type RunAgent, runPlanning, runRepair } from "./executor.ts";
import { createGitWorkspace, resolveRepository, specBranchName, ticketBranchName } from "./git.ts";
import { createGitHubIssueTracker, type RunGh, type SpecGraph, specFrontier } from "./github.ts";
import { acquireRunLock } from "./lock.ts";
import { connectGitHubProject, type ReportProjectStage } from "./projects.ts";
import { phasePrompt } from "./prompts/index.ts";
import { createSpecState, type DeliveryEvidence, pendingDeliveries } from "./state.ts";

export type WorkflowOptions = {
  cwd: string;
  config: SandcastleConfig;
  remote?: string;
  maxSpecs?: number;
  maxParallel?: number;
  signal?: AbortSignal;
  report?: (message: string) => void;
};

export type WorkflowDependencies = { run?: RunAgent; gh?: RunGh };

type TicketAssignment = { number: number; implementer: string; reason: string };

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function prepare(options: WorkflowOptions, dependencies: WorkflowDependencies, cwd: string) {
  const config = defineSandcastleConfig(options.config);
  const branch = await command("git", ["symbolic-ref", "--short", "HEAD"], cwd);
  const invocation = { branch, worktreePath: cwd };
  const { repo, remote } = await resolveRepository(cwd, branch, { repo: config.repo, remote: options.remote });
  const git = createGitWorkspace(cwd);
  const invocationBase = await git.synchronizeInvocation(branch, remote);
  const gh: RunGh =
    dependencies.gh ?? ((args) => command("gh", args, cwd, { ...process.env, GH_PROMPT_DISABLED: "1" }));
  const actor: unknown = JSON.parse(await retryGhRead(() => gh(["api", "user"]))).login;
  if (typeof actor !== "string" || !actor) throw new Error("GitHub did not identify the authenticated user.");
  await checkExecutors(cwd, config);
  const project: ReportProjectStage =
    config.workflow.projects && config.workflow.project
      ? await connectGitHubProject({ ...config.workflow.project, cwd, repo }, dependencies.gh)
      : async () => {};
  return { config, repo, remote, git, invocation, invocationBase, gh, actor, project };
}

export async function checkWorkflow(options: WorkflowOptions, dependencies: WorkflowDependencies = {}) {
  options.signal?.throwIfAborted();
  const { repo, remote, invocation, invocationBase } = await prepare(
    options,
    dependencies,
    await realpath(options.cwd),
  );
  return { repo, remote, branch: invocation.branch, head: invocationBase };
}

export async function runWorkflow(options: WorkflowOptions, dependencies: WorkflowDependencies = {}) {
  const { maxSpecs = 1, maxParallel = 4, signal, report = console.log } = options;
  for (const [name, count] of [
    ["maxSpecs", maxSpecs],
    ["maxParallel", maxParallel],
  ] as const) {
    if (!Number.isSafeInteger(count) || count < 1) throw new Error(`${name} must be a positive integer.`);
  }
  signal?.throwIfAborted();
  const cwd = await realpath(options.cwd);
  const release = await acquireRunLock(cwd);
  try {
    const prepared = await prepare(options, dependencies, cwd);
    const { config, repo, git, invocation, invocationBase, gh, actor, project } = prepared;
    const tracker = createGitHubIssueTracker({ cwd, repo }, gh);
    const delivery = createDelivery({ ...prepared, cwd, tracker, draft: config.workflow.draft, signal });
    const execute = createExecutor(cwd, config, signal, dependencies.run);
    const result = {
      attemptedSpecs: [] as number[],
      integrated: [] as number[],
      failed: [] as number[],
      delivered: [] as number[],
      incompleteSpecs: [] as number[],
      exhausted: false,
    };

    function prompt(phase: PromptPhase, role: Role, details: object) {
      return phasePrompt(
        phase,
        role,
        { repo, invocationBranch: invocation.branch, invocationBase, ...details },
        config.promptExtras,
      );
    }

    const prefix = config.workflow.branchPrefix;
    const branchFor = ({ number, body }: { number: number; body: string }) => specBranchName(number, body, prefix);
    function assertBranchOwner(number: number, branch: string, declarations: ReadonlyMap<number, string>) {
      const conflict = [...declarations].find(([owner, claimed]) => owner !== number && claimed === branch);
      if (conflict)
        throw new Error(`Spec #${number} and Spec #${conflict[0]} both declare integration branch ${branch}.`);
    }
    function branchDeclarations(issues: Awaited<ReturnType<typeof tracker.listOpenSpecs>>) {
      return new Map(
        issues.flatMap((issue) => {
          try {
            return [[issue.number, branchFor(issue)] as const];
          } catch {
            // Invalid declarations block their own Spec when its graph is loaded.
            return [];
          }
        }),
      );
    }
    async function assertCurrentOwnership(spec: Spec) {
      assertBranchOwner(spec.number, spec.branch, branchDeclarations(await tracker.listOpenSpecs()));
      if (branchFor(await tracker.readIssue(spec.number)) !== spec.branch)
        throw new Error(`Spec #${spec.number} integration branch changed.`);
    }

    async function describeGraph(graph: SpecGraph, recoveringDelivery: boolean) {
      const number = graph.spec.number;
      const branch = branchFor(graph.spec);
      const ticketPrefix = ticketBranchName(0, prefix).slice(0, -1);
      await git.assertBranch(branch);
      const branches = new Map(graph.tickets.map((ticket) => [ticket.number, ticketBranchName(ticket.number, prefix)]));
      if (
        branch === invocation.branch ||
        (branch.startsWith(ticketPrefix) && /^[1-9]\d*$/.test(branch.slice(ticketPrefix.length))) ||
        [...branches.values()].includes(invocation.branch)
      ) {
        throw new Error(`Spec #${number} reuses a protected or ticket branch.`);
      }
      const existing = await git.branchTip(branch);
      const head = existing ?? invocationBase;
      const progress = await git.inspectTickets(head, invocationBase, branches);
      return { graph, number, branch, branches, head, progress, recoveringDelivery };
    }

    type Spec = Awaited<ReturnType<typeof describeGraph>>;
    function frontier(spec: Spec) {
      return specFrontier(spec.graph, {
        integrated: new Set(spec.progress.integrated.keys()),
        resumable: spec.progress.resumable,
        actor,
        deliveryRecovery: spec.recoveringDelivery,
      });
    }

    async function refreshGraph(spec: Spec) {
      const graph = await tracker.loadSpecGraph(spec.number);
      if (
        branchFor(graph.spec) !== spec.branch ||
        graph.tickets.length !== spec.branches.size ||
        graph.tickets.some(({ number }) => !spec.branches.has(number))
      ) {
        throw new Error(
          `Spec #${spec.number} branch or ticket scope changed. Reload the task graph before continuing.`,
        );
      }
      spec.graph = graph;
    }

    function phase(
      phase: Exclude<ExecutionPhase, "plan" | "repair-and-verify">,
      promptPhase: PromptPhase,
      role: Role,
      checkout: Pick<Worktree, "branch" | "worktreePath">,
      details: { specNumber: number; ticketNumber?: number } & Record<string, unknown>,
    ) {
      const { specNumber, ticketNumber } = details;
      return execute(
        {
          phase,
          role,
          worktreePath: checkout.worktreePath,
          specNumber,
          ticketNumber,
          name: promptPhase,
        },
        (options, run) =>
          run({
            ...options,
            prompt: prompt(promptPhase, role, {
              ...details,
              branch: checkout.branch,
            }),
          }),
      );
    }

    async function explore(spec: Spec, workspace: Worktree, focus: string, tickets: TicketAssignment[]) {
      const state = createSpecState(cwd, spec.number);
      const cached = await state.readExploration(spec.head);
      if (cached) return readFile(cached, "utf8");
      const response = await phase("explore", "explore", config.roles.researcher, workspace, {
        specNumber: spec.number,
        baseline: spec.head,
        focus,
        tickets,
      }).catch((error: unknown) => {
        signal?.throwIfAborted();
        report(`Exploration for Spec #${spec.number} failed: ${describe(error)}`);
      });
      if ((await git.observe(workspace)) !== spec.head) throw new Error("Exploration changed the Spec checkout.");
      const notes = response && completionReport(response);
      if (!notes) return;
      await state.saveExploration(spec.head, notes);
      return notes;
    }

    async function implement(spec: Spec, workspace: Worktree, tickets: TicketAssignment[], exploration?: string) {
      const attempted = new Set<number>();
      async function ticketRun(ticket: TicketAssignment, baseline: string) {
        const branch = spec.branches.get(ticket.number);
        const role = Object.hasOwn(config.roles.implementers, ticket.implementer)
          ? config.roles.implementers[ticket.implementer]
          : undefined;
        if (!branch || !role) throw new Error(`Missing branch or implementer for #${ticket.number}.`);
        const resuming = spec.progress.resumable.has(ticket.number);
        const worktree = await git.open(branch, baseline, { allowDirty: resuming });
        const startedAt = await git.observe(worktree, resuming);
        await project(ticket.number, "Implementing");
        const response = await phase("implement", "implement", role, worktree, {
          specNumber: spec.number,
          ticketNumber: ticket.number,
          integrationBranch: spec.branch,
          baseline,
          startedAt,
          resuming,
          reason: ticket.reason,
          exploration,
        });
        const handoff = completionReport(response);
        if (!handoff) throw new Error("No completed verification handoff.");
        const candidate = await git.observe(worktree);
        if (!(await git.ancestor(startedAt, candidate))) throw new Error("The ticket rewrote its history.");
        if (!(await git.ancestor(baseline, candidate))) throw new Error(`Missing dispatch baseline ${baseline}.`);
        return { ticket, worktree, candidate, handoff, role };
      }

      async function integrateTicket({
        ticket,
        worktree,
        candidate,
        handoff,
        role,
      }: Awaited<ReturnType<typeof ticketRun>>) {
        async function integrate(head: string, report: string) {
          if (report.includes("\0") || Buffer.byteLength(report) > 60_000)
            throw new Error("The verification handoff must fit a GitHub comment.");
          await delivery.recordComment(
            ticket.number,
            `Spec #${spec.number} verification handoff for ticket #${ticket.number}.\n\nTicket candidate: \`${head}\`\n\n${report}`,
          );
          await assertCurrentOwnership(spec);
          return git.integrate(workspace, worktree, ticket.number, head, report);
        }
        let merge = await integrate(candidate, handoff);
        if (merge.status === "conflict") {
          const integrationSha = merge.integrationSha;
          const response = await phase("resolve-conflict", "resolve-conflict", role, worktree, {
            specNumber: spec.number,
            ticketNumber: ticket.number,
            integrationBranch: spec.branch,
            integrationSha,
            candidate,
          });
          const resolvedHandoff = completionReport(response);
          if (!resolvedHandoff) throw new Error("No completed conflict-resolution handoff.");
          const resolved = await git.observe(worktree);
          if (!(await git.ancestor(candidate, resolved)) || !(await git.ancestor(integrationSha, resolved)))
            throw new Error("Conflict resolution does not include both sides.");
          if ((await git.observe(workspace)) !== integrationSha)
            throw new Error("Integration tip moved during conflict resolution.");
          merge = await integrate(resolved, `${handoff}\n\nConflict resolution:\n${resolvedHandoff}`);
        }
        if (merge.status !== "merged") throw new Error(`Candidate integration returned ${merge.status}.`);
        return merge;
      }

      // Capture rejections at dispatch so a sibling failure cannot go unobserved during a merge.
      type Outcome = { value: Awaited<ReturnType<typeof ticketRun>> } | { error: unknown };
      const pending = new Map<number, Promise<{ number: number; outcome: Outcome }>>();
      try {
        for (;;) {
          signal?.throwIfAborted();
          if (pending.size < maxParallel && tickets.some(({ number }) => !attempted.has(number))) {
            await refreshGraph(spec);
          }
          const ready = new Set(frontier(spec).ready.map(({ number }) => number));
          const baseline = await git.observe(workspace);
          for (const ticket of tickets) {
            if (pending.size >= maxParallel) break;
            if (!ready.has(ticket.number) || attempted.has(ticket.number)) continue;
            attempted.add(ticket.number);
            pending.set(
              ticket.number,
              ticketRun(ticket, baseline).then(
                (value) => ({ number: ticket.number, outcome: { value } }),
                (error: unknown) => ({ number: ticket.number, outcome: { error } }),
              ),
            );
          }
          if (!pending.size) break;
          const { number, outcome } = await Promise.race(pending.values());
          pending.delete(number);
          try {
            if ("error" in outcome) throw outcome.error;
            spec.progress.integrated.set(number, await integrateTicket(outcome.value));
            result.integrated.push(number);
          } catch (error) {
            signal?.throwIfAborted();
            result.failed.push(number);
            report(`Ticket #${number} paused: ${describe(error)}`);
            if ((await git.observe(workspace)) !== baseline)
              throw new Error("Spec checkout changed during the failed ticket integration.", { cause: error });
            await project(number, "Needs Attention");
            continue;
          }
          await project(number, "Integrated");
        }
      } finally {
        await Promise.allSettled(pending.values());
      }
    }

    async function finalize(
      spec: Spec,
      workspace: Worktree,
      candidate: string,
      repairDeep: boolean,
    ): Promise<DeliveryEvidence> {
      const context = {
        specNumber: spec.number,
        integrationBranch: spec.branch,
        reviewBase: invocationBase,
        reviewCandidate: candidate,
        tickets: [...spec.progress.integrated].map(([number, evidence]) => ({ number, ...evidence })),
      };
      if (context.tickets.some(({ handoff }) => !handoff))
        throw new Error(
          "Integrated ticket verification handoff is missing. Verify the retained merge before continuing.",
        );
      let reviewReport = "Review stage disabled by repository configuration.";
      if (config.workflow.review) {
        await project(spec.number, "Reviewing");
        const axes = [
          phase("review", "review-standards", config.roles.reviewers.standards, workspace, context),
          phase("review", "review-spec", config.roles.reviewers.spec, workspace, context),
        ];
        try {
          const reports = (await Promise.all(axes)).map(completionReport);
          if (reports.some((report) => !report)) throw new Error("Both review axes must provide nonempty reports.");
          reviewReport = `## Standards\n\n${reports[0]}\n\n## Spec\n\n${reports[1]}`;
        } finally {
          await Promise.allSettled(axes);
        }
      }
      if ((await git.observe(workspace)) !== candidate) throw new Error("The fixed review candidate changed.");
      const role = repairDeep ? config.roles.repairerDeep : config.roles.repairer;
      const handoff = await execute(
        {
          phase: "repair-and-verify",
          role,
          worktreePath: workspace.worktreePath,
          specNumber: spec.number,
        },
        (options, run) =>
          runRepair(
            run,
            options,
            role,
            prompt("repair-and-verify", role, {
              ...context,
              reviewReport,
            }),
            () => git.observe(workspace),
          ),
      );
      return { reviewBase: invocationBase, reviewCandidate: candidate, reviewReport, ...handoff };
    }

    for (let attempt = 0; attempt < maxSpecs; attempt++) {
      signal?.throwIfAborted();
      if ((await git.observe(invocation)) !== invocationBase) throw new Error("The invocation checkout changed.");
      const open = await tracker.listOpenSpecs();
      const ready = new Set(
        open
          .filter(
            ({ labels, state }) =>
              state === "OPEN" && labels.includes("ready-for-agent") && !labels.includes("type:ticket"),
          )
          .map(({ number }) => number),
      );
      const declarations = branchDeclarations(open);
      const specs: Spec[] = [];
      for (const number of new Set([...ready, ...(await pendingDeliveries(cwd))])) {
        if (result.attemptedSpecs.includes(number) || result.incompleteSpecs.includes(number)) continue;
        try {
          const graph = await tracker.loadSpecGraph(number);
          assertBranchOwner(number, branchFor(graph.spec), declarations);
          specs.push(await describeGraph(graph, !ready.has(number)));
        } catch (error) {
          signal?.throwIfAborted();
          report(`Spec #${number} paused during backlog inspection: ${describe(error)}`);
          result.incompleteSpecs.push(number);
        }
      }
      let spec = specs.find((entry) => frontier(entry).complete);
      let repairDeep = spec !== undefined;
      let assignments: TicketAssignment[] = [];
      let focus: string | undefined;
      if (!spec) {
        const runnable = specs.filter((entry) => !entry.recoveringDelivery && frontier(entry).ready.length);
        if (!runnable.length) {
          for (const entry of specs)
            report(`Spec #${entry.number} is blocked: ${JSON.stringify(frontier(entry).blocked)}`);
          result.exhausted = true;
          break;
        }
        const role = config.roles.planner;
        const plan = await execute({ phase: "plan", role, worktreePath: cwd }, (options, run) =>
          runPlanning(
            run,
            options,
            role,
            prompt("plan", role, {
              specs: runnable.map((entry) => ({ ...entry.graph, frontier: frontier(entry) })),
              implementers: Object.entries(config.roles.implementers).map(([name, role]) => ({
                name,
                description: role.description,
              })),
            }),
          ),
        );
        if ((await git.observe(invocation)) !== invocationBase)
          throw new Error("Planning changed the invocation checkout.");
        if (plan.spec === null) {
          result.exhausted = true;
          break;
        }
        spec = runnable.find((entry) => entry.number === plan.spec);
        if (!spec) throw new Error(`Planner selected unavailable Spec #${plan.spec}.`);
        const permitted = new Set(frontier(spec).plannable.map(({ number }) => number));
        if (
          plan.issues.length !== permitted.size ||
          plan.issues.some(
            ({ number, implementer }) =>
              !permitted.has(number) || !Object.hasOwn(config.roles.implementers, implementer),
          )
        ) {
          throw new Error(
            `Planner must assign every plannable ticket of Spec #${spec.number} to a configured implementer.`,
          );
        }
        assignments = plan.issues;
        // Recovery has merge evidence without the original role selection. Use the deeper verifier for that case.
        repairDeep = Boolean(plan.repairDeep || spec.progress.integrated.size);
        if (plan.explore.needed && config.workflow.explore) focus = plan.explore.focus;
      }

      const { number, branch, head, branches } = spec;
      result.attemptedSpecs.push(number);
      let milestone = "prepare the managed worktree";
      try {
        await refreshGraph(spec);
        await assertCurrentOwnership(spec);
        const workspace = await git.open(branch, head);
        if ((await git.observe(workspace)) !== head) throw new Error("Spec branch moved after planning.");
        const state = createSpecState(cwd, number);
        if (assignments.length) {
          milestone = "implement and integrate tickets";
          await project(number, "Implementing");
          const notes = focus === undefined ? undefined : await explore(spec, workspace, focus, assignments);
          await implement(spec, workspace, assignments, notes);
          await refreshGraph(spec);
        }
        const candidate = await git.observe(workspace);
        spec.progress = await git.inspectTickets(candidate, invocationBase, branches);
        if (!frontier(spec).complete) {
          throw new Error(`Spec still has unintegrated or blocked tickets: ${JSON.stringify(frontier(spec).blocked)}`);
        }
        milestone = "recover delivery or prepare final verification";
        const existingPr = await delivery.openPr(branch, candidate);
        const recordedPr = await state.readOpenPr(candidate);
        if (recordedPr !== undefined && existingPr?.number !== recordedPr) {
          throw new Error(`Previously verified PR #${recordedPr} is no longer open at this candidate.`);
        }
        if (spec.recoveringDelivery && !existingPr) throw new Error("An unqueued Spec requires its matching open PR.");
        let evidence = await state.readDelivery(candidate);
        let final = candidate;
        if (
          !existingPr &&
          (!evidence ||
            evidence.reviewBase !== invocationBase ||
            !(await git.ancestor(evidence.reviewCandidate, candidate)))
        ) {
          milestone = "finish final verification";
          evidence = await finalize(spec, workspace, candidate, repairDeep);
          await refreshGraph(spec);
          if (!frontier(spec).complete)
            throw new Error("Spec admission or dependency scope changed during verification.");
          final = await git.observe(workspace);
          if (!(await git.ancestor(candidate, final)))
            throw new Error("Final verification rewrote the reviewed history.");
          await state.saveDelivery(final, evidence);
        }
        milestone = "finish PR delivery and worktree cleanup";
        await assertCurrentOwnership(spec);
        const pr = await delivery.deliver({
          graph: spec.graph,
          workspace,
          head: final,
          integrated: spec.progress.integrated,
          ticketBranches: branches,
          evidence,
          existingPr,
        });
        await state.clearDelivery();
        result.delivered.push(number);
        report(`Spec #${number} delivered at ${final} in ${pr.url}.`);
      } catch (error) {
        signal?.throwIfAborted();
        const message = `Spec #${number} paused while attempting to ${milestone}.\n\n${describe(error)}\n\nResume from the retained Git worktrees and any matching remote PR.`;
        report(message);
        result.incompleteSpecs.push(number);
        await project(number, "Needs Attention");
        await delivery.recordComment(number, message).catch((commentError: unknown) => {
          report(`Could not record the recovery point for Spec #${number}: ${describe(commentError)}`);
        });
      }
    }
    return result;
  } finally {
    await release();
  }
}
