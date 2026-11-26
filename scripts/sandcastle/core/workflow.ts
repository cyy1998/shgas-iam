import { randomUUID } from "node:crypto";
import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { type BindMountBranchStrategy, run as nativeRun, type RunResult } from "@ai-hero/sandcastle";
import { command, retryGhRead } from "./command.ts";
import {
  assertBoundary,
  assertRemoteMatchesRepo,
  assertValidBranchName,
  branchTip,
  createSerialQueue,
  deleteBranchCas,
  ensureSpecWorktree,
  fetchBase,
  findBranchWorktree,
  isAncestor,
  mergeBase,
  mergeTicket,
  observeCleanCheckout,
  pushBranchNonForce,
  readIntegratedTickets,
  removeWorktreeSafe,
  specBranchName,
  ticketBranchName,
} from "./git.ts";
import {
  ensurePr,
  findBranchConflicts,
  findOpenPr,
  type GhOptions,
  pauseSpec,
  readSingleSpecGraph,
  readSpecGraph,
  readSpecLabels,
  removeLabel,
  resolveTicketTier,
  specFrontier,
  validateRepository,
} from "./github.ts";
import {
  preflightCredentials,
  readonlySandbox,
  readReviewCache,
  resolvePromptFile,
  writeReviewCache,
} from "./sandbox.ts";
import type {
  AfkCheckResult,
  AfkDeps,
  AfkOptions,
  AfkRunResult,
  AgentSlot,
  CheckAfkOptions,
  ImplementerTier,
  IntegratedTicket,
  IssueComment,
  IssueRef,
  Phase,
  PhaseSession,
  PullRequestInfo,
  RunAgent,
  SpecGraph,
  SpecIssue,
  TicketIssue,
} from "./types.ts";

const completeSignal = "<promise>COMPLETE</promise>";
const ticketBranchPattern = /^sandcastle\/ticket-[1-9]\d*$/;

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    const details = error.errors.map((item) => describeError(item)).join("; ");
    return details ? `${error.message} (${details})` : error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

function assertPositiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function resolveSlot(slot: AgentSlot) {
  return "provider" in slot
    ? { provider: slot.provider, instructions: slot.instructions ?? "" }
    : { provider: slot, instructions: "" };
}

function slotForTier(agents: AfkOptions["agents"], tier: ImplementerTier): AgentSlot {
  if (tier === "light") return agents.implementLight;
  if (tier === "deep") return agents.implementDeep;
  return agents.implementStandard;
}

function hasCompletionLine(stdout: string): boolean {
  return stdout.trimEnd().split("\n").at(-1)?.trim() === completeSignal;
}

function completionReport(result: RunResult): string | undefined {
  if (result.completionSignal !== completeSignal || !hasCompletionLine(result.stdout)) return undefined;
  const trimmed = result.stdout.trimEnd();
  return trimmed.slice(0, -completeSignal.length).trim() || undefined;
}

function extractPrBody(stdout: string): string | undefined {
  return [...stdout.matchAll(/<pr-body>([\s\S]*?)<\/pr-body>/g)].at(-1)?.[1]?.trim() || undefined;
}

function formatBlockers(blockers: readonly IssueRef[]): string {
  if (blockers.length === 0) return "none";
  return blockers.map((blocker) => `${blocker.repo}#${blocker.number} (${blocker.state})`).join(", ");
}

function formatComments(comments: readonly IssueComment[]): string {
  if (comments.length === 0) return "(none)";
  return comments
    .map((comment) => `#### @${comment.author} (${comment.createdAt})\n\n${comment.body.trim() || "(empty)"}`)
    .join("\n\n");
}

function formatSpecContext(spec: SpecIssue, specBranch: string): string {
  return [
    `### Spec #${spec.number}: ${spec.title}`,
    `- Repository: ${spec.repo}`,
    `- Integration branch: \`${specBranch}\``,
    `- Labels: ${spec.labels.join(", ") || "none"}`,
    `- Blockers: ${formatBlockers(spec.blockers)}`,
    "",
    spec.body.trim() || "(no description)",
    "",
    "### Comments",
    "",
    formatComments(spec.comments),
  ].join("\n");
}

function formatTicketContext(ticket: TicketIssue, ticketBranch: string): string {
  return [
    `### Ticket #${ticket.number}: ${ticket.title}`,
    `- Branch: \`${ticketBranch}\``,
    `- Labels: ${ticket.labels.join(", ") || "none"}`,
    `- Blockers: ${formatBlockers(ticket.blockers)}`,
    "",
    ticket.body.trim() || "(no description)",
    "",
    "### Comments",
    "",
    formatComments(ticket.comments),
  ].join("\n");
}

function formatTicketsContext(
  tickets: readonly TicketIssue[],
  integrated: ReadonlyMap<number, IntegratedTicket>,
): string {
  if (tickets.length === 0) return "(none)";
  return tickets
    .map((ticket) => {
      const merged = integrated.get(ticket.number);
      const mergeLine = merged ? `- Merge commit: \`${merged.mergeSha}\` (candidate \`${merged.candidateSha}\`)` : "";
      return [
        `### Ticket #${ticket.number}: ${ticket.title}`,
        `- Labels: ${ticket.labels.join(", ") || "none"}`,
        `- Blockers: ${formatBlockers(ticket.blockers)}`,
        mergeLine,
        "",
        ticket.body.trim() || "(no description)",
        "",
        "#### Comments",
        "",
        formatComments(ticket.comments),
      ]
        .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
        .join("\n");
    })
    .join("\n\n---\n\n");
}

async function resolveSpecBranchValidated(cwd: string, spec: SpecIssue, baseBranch: string): Promise<string> {
  const branch = specBranchName(spec.number, spec.body);
  await assertValidBranchName(cwd, branch);
  if (branch === baseBranch || ticketBranchPattern.test(branch)) {
    throw new Error(`Spec #${spec.number} declares a reserved integration branch "${branch}".`);
  }
  return branch;
}

export async function checkAfk(options: CheckAfkOptions, deps: Pick<AfkDeps, "runGh"> = {}): Promise<AfkCheckResult> {
  const repo = validateRepository(options.repo);
  const cwd = await realpath(options.cwd ?? process.cwd());
  const remote = options.remote?.trim() || "origin";
  const baseBranch = options.baseBranch?.trim() || "main";

  await preflightCredentials(cwd, remote);
  await assertRemoteMatchesRepo(cwd, remote, repo);
  const { remoteRef, sha: baseSha } = await fetchBase(cwd, remote, baseBranch);
  const runGh =
    deps.runGh ?? ((args: string[]) => command("gh", args, cwd, { ...process.env, GH_PROMPT_DISABLED: "1" }));
  await retryGhRead(() => runGh(["pr", "list", "--repo", repo, "--limit", "1", "--json", "number"]));

  return { repo, cwd, remote, baseBranch, remoteRef, baseSha };
}

export async function runAfk(options: AfkOptions, deps: AfkDeps = {}): Promise<AfkRunResult> {
  const repo = validateRepository(options.repo);
  const maxSpecs = assertPositiveInt(options.maxSpecs ?? 1, "maxSpecs");
  const maxParallel = assertPositiveInt(options.maxParallel ?? 4, "maxParallel");
  const remote = options.remote?.trim() || "origin";
  const baseBranch = options.baseBranch?.trim() || "main";
  const draft = options.draft ?? false;
  const cwd = await realpath(options.cwd ?? process.cwd());
  const promptsDir = options.promptsDir ?? join(cwd, ".sandcastle", "prompts");
  const runAgent: RunAgent = deps.runAgent ?? nativeRun;
  const ghOptions: GhOptions = { cwd, runGh: deps.runGh };
  const report = deps.report ?? console.log;

  await preflightCredentials(cwd, remote);
  await assertRemoteMatchesRepo(cwd, remote, repo);
  const initialBase = await fetchBase(cwd, remote, baseBranch);

  const result: AfkRunResult = {
    attemptedSpecs: [],
    integrated: [],
    failed: [],
    delivered: [],
    paused: [],
    stopped: [],
    exhausted: false,
  };
  const handledSpecs = new Set<number>();

  async function safePauseSpec(specNumber: number, reason: string): Promise<void> {
    report(reason);
    try {
      await pauseSpec(repo, specNumber, reason, ghOptions);
    } catch (pauseError) {
      report(`Failed to pause Spec #${specNumber} on GitHub: ${describeError(pauseError)}`);
    }
  }

  async function runPhase(input: {
    phase: Phase;
    readonly: boolean;
    slot: AgentSlot;
    phaseCwd: string;
    branchStrategy: BindMountBranchStrategy;
    promptArgs: Record<string, string>;
    tag: string;
  }): Promise<RunResult> {
    const { phase, readonly, slot, phaseCwd, branchStrategy, promptArgs, tag } = input;
    if (phaseCwd !== cwd) {
      await preflightCredentials(phaseCwd, remote);
    }
    const { provider, instructions } = resolveSlot(slot);
    const promptFile = await resolvePromptFile(phase, promptsDir);
    const runId = `${phase}-${tag}-${randomUUID().slice(0, 8)}`;
    const logsDir = join(cwd, ".sandcastle", "logs");
    await mkdir(logsDir, { recursive: true, mode: 0o700 });

    const session: PhaseSession =
      typeof options.sandbox === "function"
        ? await options.sandbox({ phase, readonly, runId })
        : { sandbox: options.sandbox };

    const effectiveSandbox = readonly ? readonlySandbox(session.sandbox) : session.sandbox;
    let runResult: RunResult | undefined;
    let runError: unknown;
    let cleanupError: unknown;
    try {
      runResult = await runAgent({
        cwd: phaseCwd,
        agent: provider,
        sandbox: effectiveSandbox,
        branchStrategy,
        promptFile,
        promptArgs: { ...promptArgs, ROLE_INSTRUCTIONS: instructions },
        hooks: readonly ? undefined : session.hooks,
        name: phase,
        logging: { type: "file", path: join(logsDir, `${runId}.log`) },
        completionSignal: completeSignal,
        maxIterations: 1,
      });
    } catch (error) {
      runError = error;
    } finally {
      try {
        await session.cleanup?.();
      } catch (error) {
        cleanupError = error;
      }
    }

    if (runError !== undefined && cleanupError !== undefined) {
      throw new AggregateError([runError, cleanupError], `Phase "${phase}" and cleanup failed.`);
    }
    if (runError !== undefined) throw runError;
    if (cleanupError !== undefined) throw cleanupError;
    return runResult as RunResult;
  }

  async function finishCleanupAndUntag(input: {
    graph: SpecGraph;
    specBranch: string;
    specTip: string;
    integrated: ReadonlyMap<number, IntegratedTicket>;
    specWorktreePath?: string;
    pr: PullRequestInfo;
  }): Promise<void> {
    const { graph, specBranch, specTip, integrated, specWorktreePath, pr } = input;

    // 3. Remove ready-for-agent from integrated tickets.
    for (const ticket of graph.tickets) {
      if (integrated.has(ticket.number) && ticket.labels.includes("ready-for-agent")) {
        await removeLabel(repo, ticket.number, "ready-for-agent", ghOptions);
      }
    }

    // 4. Non-force cleanup of worktrees & CAS delete local ticket branches (preserving local Spec branch ref).
    for (const ticket of graph.tickets) {
      const tBranch = ticketBranchName(ticket.number);
      const tWorktree = await findBranchWorktree(cwd, tBranch);
      if (tWorktree) {
        if (!tWorktree.managed || tWorktree.unavailable) {
          throw new Error(
            `Refusing to clean up ticket branch ${tBranch}: checked out in external or locked worktree (${tWorktree.path}).`,
          );
        }
        await removeWorktreeSafe(cwd, tWorktree.path);
      }
      const tTip = await branchTip(cwd, tBranch);
      if (tTip) {
        const expected = integrated.get(ticket.number)?.candidateSha;
        if (!expected) {
          throw new Error(`Refusing to delete unintegrated ticket branch ${tBranch}.`);
        }
        await deleteBranchCas(cwd, tBranch, expected);
      }
    }

    if (specWorktreePath) {
      await removeWorktreeSafe(cwd, specWorktreePath);
    } else {
      const specWorktreeInfo = await findBranchWorktree(cwd, specBranch);
      if (specWorktreeInfo) {
        if (!specWorktreeInfo.managed || specWorktreeInfo.unavailable) {
          throw new Error(
            `Refusing to clean up Spec branch ${specBranch}: checked out in external or locked worktree (${specWorktreeInfo.path}).`,
          );
        }
        await removeWorktreeSafe(cwd, specWorktreeInfo.path);
      }
    }

    const retainedTip = await branchTip(cwd, specBranch);
    if (retainedTip !== specTip) {
      throw new Error(`Local Spec branch ${specBranch} tip changed during cleanup (expected ${specTip}).`);
    }

    // 5. LAST: Remove ready-for-agent from parent Spec.
    await removeLabel(repo, graph.spec.number, "ready-for-agent", ghOptions);
    result.delivered.push(graph.spec.number);
    report(`Spec #${graph.spec.number} delivered at ${specTip} in ${pr.url}.`);
  }

  for (let attempt = 0; attempt < maxSpecs; attempt++) {
    const { remoteRef, sha: baseSha } = attempt === 0 ? initialBase : await fetchBase(cwd, remote, baseBranch);
    const graphs = await readSpecGraph(repo, ghOptions);

    // Pause conflicting or malformed ready-for-agent open Specs.
    const validReadySpecs: SpecIssue[] = [];
    const invalidSpecs = new Set<number>();
    for (const graph of graphs) {
      const { spec } = graph;
      if (spec.state !== "OPEN" || !spec.labels.includes("ready-for-agent")) continue;
      try {
        await resolveSpecBranchValidated(cwd, spec, baseBranch);
        validReadySpecs.push(spec);
      } catch (error) {
        invalidSpecs.add(spec.number);
        if (!spec.labels.includes("needs-attention") && !handledSpecs.has(spec.number)) {
          handledSpecs.add(spec.number);
          result.paused.push(spec.number);
          await safePauseSpec(
            spec.number,
            `Spec #${spec.number} paused: ${describeError(error)}\n\nFix the integration branch declaration and remove \`needs-attention\` to resume.`,
          );
        }
      }
    }

    const conflicts = findBranchConflicts(validReadySpecs);
    const conflictingSpecs = new Set<number>();
    for (const conflict of conflicts) {
      for (const specNum of conflict.specNumbers) {
        conflictingSpecs.add(specNum);
        const matchingGraph = graphs.find((entry) => entry.spec.number === specNum);
        if (matchingGraph && !matchingGraph.spec.labels.includes("needs-attention") && !handledSpecs.has(specNum)) {
          handledSpecs.add(specNum);
          result.paused.push(specNum);
          const list = conflict.specNumbers.map((num) => `#${num}`).join(", ");
          await safePauseSpec(
            specNum,
            `Spec #${specNum} paused: integration branch \`${conflict.branch}\` is declared by multiple ready-for-agent Specs (${list}).\n\nResolve the branch conflict and remove \`needs-attention\` to resume.`,
          );
        }
      }
    }

    const candidates = graphs
      .filter(({ spec }) => {
        if (spec.state !== "OPEN") return false;
        if (!spec.labels.includes("type:spec") || spec.labels.includes("type:ticket")) return false;
        if (!spec.labels.includes("ready-for-agent")) return false;
        if (spec.labels.includes("needs-attention")) return false;
        if (handledSpecs.has(spec.number) || invalidSpecs.has(spec.number) || conflictingSpecs.has(spec.number)) {
          return false;
        }
        return true;
      })
      .sort((left, right) => left.spec.number - right.spec.number);

    let selected:
      | {
          graph: SpecGraph;
          specBranch: string;
          existingTip?: string;
          integrated: Map<number, IntegratedTicket>;
          complete: boolean;
        }
      | undefined;

    for (const graph of candidates) {
      const specBranch = specBranchName(graph.spec.number, graph.spec.body);
      const existingTip = await branchTip(cwd, specBranch);
      const integrated = existingTip
        ? await readIntegratedTickets(cwd, specBranch, await mergeBase(cwd, specBranch, remoteRef))
        : new Map<number, IntegratedTicket>();
      const frontier = specFrontier(graph, new Set(integrated.keys()));

      if ((frontier.complete && existingTip) || frontier.ready.length > 0) {
        selected = { graph, specBranch, existingTip, integrated, complete: frontier.complete };
        break;
      }

      report(`Spec #${graph.spec.number} has no ready tickets: ${JSON.stringify(frontier.blocked)}`);
    }

    if (!selected) {
      result.exhausted = true;
      break;
    }

    const { graph, specBranch } = selected;
    const specNumber = graph.spec.number;
    handledSpecs.add(specNumber);
    result.attemptedSpecs.push(specNumber);

    let stage = "initialize Spec";
    try {
      // Fast-path idempotent delivery cleanup when a matching Open PR already exists at specTip.
      if (selected.complete && selected.existingTip) {
        stage = "check existing open pull request";
        const existingPr = await findOpenPr(repo, { headBranch: specBranch, baseBranch }, ghOptions);
        if (existingPr && existingPr.headRefOid === selected.existingTip) {
          const syncedPr = await ensurePr(
            repo,
            {
              spec: graph.spec,
              tickets: graph.tickets,
              integrated: selected.integrated,
              headBranch: specBranch,
              baseBranch,
              headSha: selected.existingTip,
              draft,
            },
            ghOptions,
          );
          stage = "finish idempotent PR delivery cleanup";
          await finishCleanupAndUntag({
            graph,
            specBranch,
            specTip: selected.existingTip,
            integrated: selected.integrated,
            pr: syncedPr,
          });
          continue;
        }
      }

      stage = "prepare Spec worktree";
      const specWorktree = await ensureSpecWorktree(cwd, specBranch, baseSha);
      const specMergeBase = await mergeBase(cwd, specBranch, remoteRef);
      const integrated = await readIntegratedTickets(cwd, specBranch, specMergeBase);
      const activeGraph: SpecGraph = { spec: graph.spec, tickets: [...graph.tickets] };
      const specContext = formatSpecContext(activeGraph.spec, specBranch);

      let expectedSpecTip = specWorktree.head;
      let expectedRemoteSha = baseSha;
      const serialize = createSerialQueue();

      // Parallel ticket dispatch + serial merge loop.
      stage = "implement and integrate tickets";
      type TicketRunOutcome =
        | {
            ok: true;
            handoff: string;
            baselineSha: string;
            slot: AgentSlot;
            ticketBranch: string;
          }
        | { ok: false; error: unknown };

      const attemptedTickets = new Set<number>();
      const inFlight = new Map<number, Promise<{ ticket: TicketIssue; outcome: TicketRunOutcome }>>();
      let softStopped = false;
      let fatalError: unknown;
      const ticketFailures: Array<{ number: number; reason: string }> = [];

      const assertCleanTicketWorktree = async (ticketNumber: number, tBranch: string, runRes: RunResult) => {
        if (runRes.preservedWorktreePath) {
          throw new Error(
            `Ticket #${ticketNumber} left uncommitted changes in preserved worktree ${runRes.preservedWorktreePath}.`,
          );
        }
        const lingering = await findBranchWorktree(cwd, tBranch);
        if (lingering && lingering.managed && !lingering.unavailable) {
          await observeCleanCheckout(lingering.path);
        }
      };

      const dispatchTicket = async (
        ticket: TicketIssue,
        slot: AgentSlot,
        tBranch: string,
        baselineSha: string,
      ): Promise<TicketRunOutcome> => {
        try {
          const runRes = await runPhase({
            phase: "implement",
            readonly: false,
            slot,
            phaseCwd: cwd,
            branchStrategy: { type: "branch", branch: tBranch, baseBranch: specBranch },
            promptArgs: {
              BASE_SHA: baselineSha,
              SPEC: specContext,
              TICKET: formatTicketContext(ticket, tBranch),
            },
            tag: `ticket-${ticket.number}`,
          });
          await assertCleanTicketWorktree(ticket.number, tBranch, runRes);
          const handoff = completionReport(runRes);
          if (!handoff) {
            throw new Error(`Ticket #${ticket.number} did not complete with a verification handoff.`);
          }
          return { ok: true, handoff, baselineSha, slot, ticketBranch: tBranch };
        } catch (error) {
          return { ok: false, error };
        }
      };

      try {
        for (;;) {
          const frontier = specFrontier(activeGraph, new Set(integrated.keys()));
          const nextReady = frontier.ready.filter((ticket) => !attemptedTickets.has(ticket.number));

          while (!softStopped && !fatalError && inFlight.size < maxParallel && nextReady.length > 0) {
            // Re-read Spec labels before each dispatch as a soft-stop switch.
            const liveLabels = await readSpecLabels(repo, specNumber, ghOptions);
            if (!liveLabels.includes("ready-for-agent") || liveLabels.includes("needs-attention")) {
              softStopped = true;
              report(`Spec #${specNumber} soft-stopped: labels are now [${liveLabels.join(", ")}].`);
              break;
            }

            const ticket = nextReady.shift();
            if (!ticket) break;

            let tier: ImplementerTier;
            try {
              tier = resolveTicketTier(ticket);
            } catch (error) {
              fatalError = error;
              break;
            }

            const slot = slotForTier(options.agents, tier);
            const tBranch = ticketBranchName(ticket.number);
            const existingTicketTip = await branchTip(cwd, tBranch);
            const baselineSha = existingTicketTip ?? expectedSpecTip;

            attemptedTickets.add(ticket.number);
            inFlight.set(
              ticket.number,
              dispatchTicket(ticket, slot, tBranch, baselineSha).then((outcome) => ({ ticket, outcome })),
            );
          }

          if (fatalError !== undefined) break;
          if (inFlight.size === 0) {
            // Before leaving the ticket loop for review, refresh once to pick up any newly added ready-for-agent sub-issues.
            // Draft sub-issues added mid-run without ready-for-agent are intentionally ignored so they do not pause the Spec.
            if (!softStopped && ticketFailures.length === 0) {
              const refreshed = await readSingleSpecGraph(repo, specNumber, ghOptions);
              const known = new Set(activeGraph.tickets.map((ticket) => ticket.number));
              const newlyReady = refreshed.tickets.filter(
                (ticket) =>
                  !known.has(ticket.number) &&
                  ticket.state === "OPEN" &&
                  ticket.labels.includes("type:ticket") &&
                  !ticket.labels.includes("type:spec") &&
                  ticket.labels.includes("ready-for-agent") &&
                  !ticket.labels.includes("needs-attention"),
              );
              if (newlyReady.length > 0) {
                activeGraph.tickets.push(...newlyReady);
                continue;
              }
            }
            break;
          }

          const finished = await Promise.race(inFlight.values());
          inFlight.delete(finished.ticket.number);

          await serialize(async () => {
            if (fatalError !== undefined) return;
            const { ticket, outcome } = finished;
            if (!outcome.ok) {
              result.failed.push(ticket.number);
              ticketFailures.push({ number: ticket.number, reason: describeError(outcome.error) });
              try {
                expectedRemoteSha = await assertBoundary(cwd, {
                  specBranch,
                  expectedSpecTip,
                  remoteRef,
                  expectedRemoteSha,
                });
              } catch (boundaryErr) {
                fatalError ??= boundaryErr;
              }
              return;
            }

            try {
              expectedRemoteSha = await assertBoundary(cwd, {
                ticketBranch: outcome.ticketBranch,
                baselineSha: outcome.baselineSha,
                specBranch,
                expectedSpecTip,
                remoteRef,
                expectedRemoteSha,
              });
            } catch (boundaryErr) {
              result.failed.push(ticket.number);
              ticketFailures.push({ number: ticket.number, reason: describeError(boundaryErr) });
              fatalError ??= boundaryErr;
              return;
            }

            try {
              let finalHandoff = outcome.handoff;
              let merged = await mergeTicket(
                cwd,
                specWorktree.worktreePath,
                ticket.number,
                outcome.ticketBranch,
                finalHandoff,
              );

              if (!merged.merged && merged.conflict) {
                const conflictBase = merged.specTip;
                const preResolveTip = await branchTip(cwd, outcome.ticketBranch);
                if (!preResolveTip) {
                  throw new Error(`Ticket branch ${outcome.ticketBranch} disappeared before conflict resolution.`);
                }
                const resolveRes = await runPhase({
                  phase: "resolve-conflict",
                  readonly: false,
                  slot: outcome.slot,
                  phaseCwd: cwd,
                  branchStrategy: { type: "branch", branch: outcome.ticketBranch, baseBranch: specBranch },
                  promptArgs: {
                    CANDIDATE_SHA: preResolveTip,
                    CONFLICT_BASE: conflictBase,
                    SPEC: specContext,
                    TICKET: formatTicketContext(ticket, outcome.ticketBranch),
                  },
                  tag: `ticket-${ticket.number}`,
                });
                await assertCleanTicketWorktree(ticket.number, outcome.ticketBranch, resolveRes);
                const resolveHandoff = completionReport(resolveRes);
                if (!resolveHandoff) {
                  throw new Error(`Conflict resolution for ticket #${ticket.number} did not complete.`);
                }

                expectedRemoteSha = await assertBoundary(cwd, {
                  ticketBranch: outcome.ticketBranch,
                  baselineSha: preResolveTip,
                  specBranch,
                  expectedSpecTip: conflictBase,
                  remoteRef,
                  expectedRemoteSha,
                });
                const resolvedTip = await branchTip(cwd, outcome.ticketBranch);
                if (!resolvedTip || !(await isAncestor(cwd, conflictBase, resolvedTip))) {
                  throw new Error(
                    `Conflict resolution for ticket #${ticket.number} does not include conflict base ${conflictBase}.`,
                  );
                }

                finalHandoff = `${finalHandoff}\n\n### Conflict Resolution\n\n${resolveHandoff}`;
                merged = await mergeTicket(
                  cwd,
                  specWorktree.worktreePath,
                  ticket.number,
                  outcome.ticketBranch,
                  finalHandoff,
                );
              }

              if (!merged.merged) {
                throw new Error(
                  merged.conflict
                    ? `Merge conflict persisted for ticket #${ticket.number} after conflict resolution.`
                    : `Ticket #${ticket.number} produced no new commits ahead of ${specBranch}.`,
                );
              }

              expectedSpecTip = merged.mergeSha;
              integrated.set(ticket.number, {
                number: ticket.number,
                mergeSha: merged.mergeSha,
                candidateSha: merged.candidateSha,
                handoff: finalHandoff,
              });
              result.integrated.push(ticket.number);
            } catch (mergeError) {
              result.failed.push(ticket.number);
              ticketFailures.push({ number: ticket.number, reason: describeError(mergeError) });
              try {
                expectedRemoteSha = await assertBoundary(cwd, {
                  specBranch,
                  expectedSpecTip,
                  remoteRef,
                  expectedRemoteSha,
                });
              } catch (boundaryErr) {
                fatalError ??= boundaryErr;
              }
            }
          });
        }
      } finally {
        if (inFlight.size > 0) {
          await Promise.allSettled(inFlight.values());
        }
      }

      if (fatalError !== undefined) throw fatalError;

      if (softStopped) {
        result.stopped.push(specNumber);
        continue;
      }

      if (ticketFailures.length > 0) {
        const details = ticketFailures.map((entry) => `- #${entry.number}: ${entry.reason}`).join("\n");
        throw new Error(`Ticket execution/integration failed:\n${details}`);
      }

      const finalFrontier = specFrontier(activeGraph, new Set(integrated.keys()));
      if (!finalFrontier.complete) {
        throw new Error(
          `Spec #${specNumber} still has unintegrated or blocked tickets: ${JSON.stringify(finalFrontier.blocked)}`,
        );
      }

      // Dual-axis read-only review with candidate SHA cache.
      stage = "run dual-axis review";
      const reviewBase = await mergeBase(cwd, specBranch, remoteRef);
      const candidateSha = await observeCleanCheckout(specWorktree.worktreePath);
      if (candidateSha !== expectedSpecTip) {
        throw new Error(`Spec worktree HEAD ${candidateSha} diverged from expected tip ${expectedSpecTip}.`);
      }

      const ticketsContext = formatTicketsContext(activeGraph.tickets, integrated);
      let reviewReport = await readReviewCache(cwd, candidateSha);
      if (!reviewReport) {
        const reviewArgs = {
          BASE_SHA: reviewBase,
          CANDIDATE_SHA: candidateSha,
          SPEC: specContext,
          TICKETS: ticketsContext,
        };
        const standardsPromise = runPhase({
          phase: "review-standards",
          readonly: true,
          slot: options.agents.reviewStandards,
          phaseCwd: specWorktree.worktreePath,
          branchStrategy: { type: "head" },
          promptArgs: reviewArgs,
          tag: `spec-${specNumber}`,
        });
        const specPromise = runPhase({
          phase: "review-spec",
          readonly: true,
          slot: options.agents.reviewSpec,
          phaseCwd: specWorktree.worktreePath,
          branchStrategy: { type: "head" },
          promptArgs: reviewArgs,
          tag: `spec-${specNumber}`,
        });

        let standardsRes: RunResult;
        let specRes: RunResult;
        try {
          [standardsRes, specRes] = await Promise.all([standardsPromise, specPromise]);
        } finally {
          await Promise.allSettled([standardsPromise, specPromise]);
        }

        expectedRemoteSha = await assertBoundary(cwd, {
          specBranch,
          expectedSpecTip: candidateSha,
          remoteRef,
          expectedRemoteSha,
        });
        const afterReviewHead = await observeCleanCheckout(specWorktree.worktreePath);
        if (afterReviewHead !== candidateSha) {
          throw new Error(`Read-only review altered Spec worktree HEAD (${afterReviewHead}).`);
        }

        const standardsText = completionReport(standardsRes);
        const specText = completionReport(specRes);
        if (!standardsText || !specText) {
          throw new Error("Both dual-axis reviews must complete with nonempty reports.");
        }
        reviewReport = { candidateSha, standards: standardsText, spec: specText };
        await writeReviewCache(cwd, reviewReport);
      }

      // Single centralized repair-and-verify session using fixed deep role.
      stage = "repair and verify";
      const combinedReview = `## Standards Review\n\n${reviewReport.standards}\n\n## Spec Review\n\n${reviewReport.spec}`;
      const repairRes = await runPhase({
        phase: "repair-and-verify",
        readonly: false,
        slot: options.agents.repair,
        phaseCwd: specWorktree.worktreePath,
        branchStrategy: { type: "head" },
        promptArgs: {
          BASE_SHA: reviewBase,
          CANDIDATE_SHA: candidateSha,
          REVIEW_REPORT: combinedReview,
          SPEC: specContext,
          TICKETS: ticketsContext,
        },
        tag: `spec-${specNumber}`,
      });
      if (!completionReport(repairRes)) {
        throw new Error(`Repair and verification for Spec #${specNumber} did not complete.`);
      }

      const finalCandidateSha = await observeCleanCheckout(specWorktree.worktreePath);
      if (!(await isAncestor(cwd, candidateSha, finalCandidateSha))) {
        throw new Error(`Repair and verification rewrote reviewed history before ${candidateSha}.`);
      }
      expectedRemoteSha = await assertBoundary(cwd, {
        specBranch,
        expectedSpecTip: finalCandidateSha,
        remoteRef,
        expectedRemoteSha,
      });

      const draftBody = extractPrBody(repairRes.stdout);

      // Ordered delivery: 1. non-force push -> 2. ensurePr -> 3. untag tickets -> 4. cleanup -> 5. untag Spec LAST.
      stage = "deliver pull request";
      await assertRemoteMatchesRepo(cwd, remote, repo);
      await pushBranchNonForce(cwd, remote, specBranch, finalCandidateSha);
      const pr = await ensurePr(
        repo,
        {
          spec: activeGraph.spec,
          tickets: activeGraph.tickets,
          integrated,
          headBranch: specBranch,
          baseBranch,
          headSha: finalCandidateSha,
          draftBody,
          draft,
        },
        ghOptions,
      );

      await finishCleanupAndUntag({
        graph: activeGraph,
        specBranch,
        specTip: finalCandidateSha,
        integrated,
        specWorktreePath: specWorktree.worktreePath,
        pr,
      });
    } catch (error) {
      result.paused.push(specNumber);
      const message = [
        `Spec #${specNumber} paused during "${stage}".`,
        "",
        describeError(error),
        "",
        "Worktrees and branches have been preserved for recovery. Fix the issue and remove `needs-attention` to resume.",
      ].join("\n");
      await safePauseSpec(specNumber, message);
    }
  }

  return result;
}
