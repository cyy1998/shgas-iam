import { randomUUID } from "node:crypto";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type AgentStreamEvent,
  type BindMountCreateOptions,
  type BindMountSandboxHandle,
  Output,
  type RunOptions,
  type RunResult,
  run,
  StructuredOutputError,
} from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { dockerRegistryAuth } from "./auth.ts";
import type {
  ExecutionPhase,
  ExecutorContext,
  PreparedAuth,
  ResolvedSandcastleConfig,
  Role,
  SandboxInputs,
} from "./config.ts";
import { complete } from "./prompts/index.ts";

type AgentResult = RunResult & { output?: unknown };
export type RunAgent = (options: RunOptions) => Promise<AgentResult>;

export function completed(result: RunResult): boolean {
  return result.completionSignal === complete && hasCompletion(result.stdout);
}

export function completionReport(result: RunResult): string | undefined {
  if (!completed(result)) return;
  const report = result.stdout.trimEnd().slice(0, -complete.length).trim();
  return report || undefined;
}

function hasCompletion(text: string): boolean {
  return text.trimEnd().split("\n").at(-1)?.trim() === complete;
}

function canResume(role: Role) {
  return Boolean(role.provider.sessionStorage && role.provider.captureSessions);
}

export async function checkExecutors(cwd: string, config: ResolvedSandcastleConfig) {
  const { planner, researcher, implementers, reviewers, repairer, repairerDeep } = config.roles;
  const roles = [
    planner,
    ...Object.values(implementers),
    repairer,
    repairerDeep,
    ...(config.workflow.explore ? [researcher] : []),
    ...(config.workflow.review ? [reviewers.standards, reviewers.spec] : []),
  ];
  for (const provider of new Set(roles.map((role) => role.provider))) {
    for (const adapter of config.authAdapters ?? []) {
      if (adapter.appliesTo(provider)) await adapter.check({ cwd, provider });
    }
  }
  if (config.sandbox.dockerAccess) await dockerSocket();
  if (config.sandbox.dockerAuth) await dockerRegistryAuth(config.sandbox.dockerAuth).check(cwd);
}

const socket = "/var/run/docker.sock";
async function dockerSocket() {
  const info = await stat(socket);
  if (!info.isSocket()) throw new Error(`Expected a Docker socket at ${socket}.`);
  return info.gid;
}

function protectSandbox(sandbox: ReturnType<typeof docker>, readOnly: boolean, openSandboxes: Set<string>) {
  // Docker 0.14 omits create from its return type. The SDK swallows errors from handle.close().
  if (!("create" in sandbox) || typeof sandbox.create !== "function")
    throw new Error("Expected the native bind-mount sandbox.");
  const create = sandbox.create.bind(sandbox);
  return {
    ...sandbox,
    async create(options: BindMountCreateOptions): Promise<BindMountSandboxHandle> {
      // The native SDK merges the worktree's .sandcastle/.env after we build the provider.
      const env = { ...options.env };
      delete env.GH_TOKEN;
      delete env.GITHUB_TOKEN;
      if (readOnly) {
        for (const key of Object.keys(env)) {
          if (key.startsWith("GIT_CONFIG_")) delete env[key];
        }
      }
      const mounts = readOnly ? options.mounts.map((mount) => ({ ...mount, readonly: true })) : options.mounts;
      const handle: BindMountSandboxHandle = await create({ ...options, env, mounts });
      const id = handle.sandboxId ?? "unknown";
      openSandboxes.add(id);
      return {
        ...handle,
        async close() {
          await handle.close();
          openSandboxes.delete(id);
        },
      };
    },
  };
}

export function createExecutor(
  cwd: string,
  config: ResolvedSandcastleConfig,
  signal?: AbortSignal,
  runAgent: RunAgent = run,
) {
  return async function execute<T>(
    input: {
      phase: ExecutionPhase;
      role: Role;
      worktreePath: string;
      specNumber?: number;
      ticketNumber?: number;
      name?: string;
    },
    operation: (options: RunOptions, runAgent: RunAgent) => Promise<T>,
  ): Promise<T> {
    signal?.throwIfAborted();
    const { name, ...stage } = input;
    const context: ExecutorContext = { ...stage, cwd, id: randomUUID() };
    const { sandbox, lifecycle } = config;
    const readOnly = input.phase === "plan" || input.phase === "explore" || input.phase === "review";
    const useDocker = !readOnly && sandbox.dockerAccess;
    const auth: PreparedAuth[] = [];
    let lifecycleInputs: SandboxInputs | undefined;
    let executionFinished = false;
    const openSandboxes = new Set<string>();
    const errors: unknown[] = [];
    let value: T | undefined;
    try {
      for (const adapter of config.authAdapters ?? []) {
        if (adapter.appliesTo(input.role.provider)) {
          auth.push(await adapter.prepare({ cwd, provider: input.role.provider }));
        }
      }
      if (!readOnly && sandbox.dockerAuth) auth.push(await dockerRegistryAuth(sandbox.dockerAuth).prepare(cwd));
      if (!readOnly && lifecycle?.beforeExecutor) {
        lifecycleInputs = await lifecycle.beforeExecutor(context);
      }
      const shared = readOnly ? sandbox.mounts?.map((mount) => ({ ...mount, readonly: true })) : sandbox.mounts;
      const inputs = [
        { mounts: shared, env: sandbox.env },
        readOnly ? undefined : sandbox.writable,
        ...auth,
        lifecycleInputs,
      ];
      const mounts = inputs.flatMap((entry) => entry?.mounts ?? []);
      const env = Object.assign({}, ...inputs.map((entry) => entry?.env));
      const groups = useDocker ? [await dockerSocket()] : undefined;
      if (useDocker) {
        mounts.push({ hostPath: socket, sandboxPath: socket });
        env.DOCKER_HOST = `unix://${socket}`;
      }
      const provider = docker({
        imageName: sandbox.image,
        mounts,
        env,
        groups,
        network: useDocker ? "host" : undefined,
      });
      const commands = readOnly ? [] : [lifecycle?.prepareCommand, lifecycle?.hooksCommand].filter(Boolean);
      // SDK ready hooks run in parallel. A single hook makes preparation a prerequisite of hook installation.
      const hooks = commands.length
        ? {
            sandbox: {
              onSandboxReady: [
                {
                  command: commands.map((step) => `{\n${step}\n}`).join(" && "),
                  timeoutMs: lifecycle?.prepareTimeoutMs,
                },
              ],
            },
          }
        : undefined;
      const logs = join(cwd, ".sandcastle", "logs");
      await mkdir(logs, { recursive: true, mode: 0o700 });
      value = await operation(
        {
          cwd: input.worktreePath,
          agent: input.role.provider,
          sandbox: protectSandbox(provider, readOnly, openSandboxes),
          branchStrategy: { type: "head" },
          name: name ?? input.phase,
          hooks,
          logging: { type: "file", path: join(logs, `${context.id}.log`) },
          signal,
          completionSignal: complete,
          maxIterations: config.workflow.maxIterations[input.phase],
        },
        runAgent,
      );
      executionFinished = true;
    } catch (error) {
      errors.push(error);
    } finally {
      if (openSandboxes.size) {
        errors.push(new Error(`Sandbox shutdown unconfirmed for ${context.id}: ${[...openSandboxes].join(", ")}.`));
      }
      if (!readOnly && executionFinished && openSandboxes.size === 0 && !signal?.aborted) {
        await lifecycle?.afterExecutor?.(context, lifecycleInputs).catch((error) => errors.push(error));
      }
      for (const credential of auth.reverse()) await credential.close().catch((error) => errors.push(error));
    }
    if (errors.length > 1) throw new AggregateError(errors, `Execution and cleanup failed for ${input.phase}.`);
    if (errors.length) throw errors[0];
    return value as T;
  };
}

type Plan = {
  spec: number | null;
  explore: { needed: boolean; focus: string };
  repairDeep?: boolean;
  issues: { number: number; implementer: string; reason: string }[];
};

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function issueNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPlan(value: unknown): value is Plan {
  return (
    object(value) &&
    (value.spec === null || issueNumber(value.spec)) &&
    (value.repairDeep === undefined || typeof value.repairDeep === "boolean") &&
    object(value.explore) &&
    typeof value.explore.needed === "boolean" &&
    typeof value.explore.focus === "string" &&
    (!value.explore.needed || Boolean(value.explore.focus.trim())) &&
    Array.isArray(value.issues) &&
    value.issues.every(
      (item) =>
        object(item) &&
        issueNumber(item.number) &&
        typeof item.implementer === "string" &&
        Boolean(item.implementer.trim()) &&
        typeof item.reason === "string" &&
        Boolean(item.reason.trim()),
    ) &&
    new Set(value.issues.map(({ number }) => number)).size === value.issues.length &&
    (value.spec === null ? value.issues.length === 0 : value.issues.length > 0)
  );
}

const planOutput = (maxRetries: number) =>
  Output.object({
    tag: "plan",
    maxRetries,
    schema: {
      "~standard": {
        version: 1,
        vendor: "sandcastle-workflow",
        validate: (value: unknown) =>
          isPlan(value)
            ? { value }
            : {
                issues: [
                  { message: "Expected a Spec selection, an exploration decision and unique ticket assignments." },
                ],
              },
      },
    },
  });

function nextSession(result: RunResult, phase: string) {
  const id = result.iterations.at(-1)?.sessionId;
  if (!id) throw new Error(`${phase} requires a captured session to continue.`);
  return id;
}

export async function runPlanning(runAgent: RunAgent, options: RunOptions, role: Role, prompt: string): Promise<Plan> {
  const turns = options.maxIterations ?? 1;
  const resume = canResume(role);
  if (turns > 1 && !resume) throw new Error("Multi-turn planning requires a session-capable provider.");
  let session: string | undefined;
  // The native Output API is single-turn. Preliminary turns and format corrections have separate budgets.
  for (let turn = 1; turn < turns; turn++) {
    const result = await runAgent({
      ...options,
      prompt: `${prompt}\n\nPlanning turn ${turn}/${turns}. Investigate and summarize evidence before the final plan turn.`,
      resumeSession: session,
      maxIterations: 1,
    });
    session = nextSession(result, "Planning");
  }
  const result = await runAgent({
    ...options,
    prompt,
    resumeSession: session,
    maxIterations: 1,
    output: planOutput(resume ? 2 : 0),
  });
  if (!isPlan(result.output)) throw new Error("Planner returned no valid structured plan.");
  return result.output;
}

export async function runRepair(
  runAgent: RunAgent,
  options: RunOptions,
  role: Role,
  prompt: string,
  observe: () => Promise<string>,
) {
  const turns = options.maxIterations ?? 1;
  const resume = canResume(role);
  if (turns > 1 && !resume) throw new Error("Multi-turn repair requires a session-capable provider.");
  const output = Output.string({ tag: "pr-body", maxRetries: 0 });
  let session: string | undefined;
  for (let turn = 1; turn <= turns; turn++) {
    let text = "";
    let terminal = "";
    let result: AgentResult | undefined;
    const logging =
      options.logging?.type === "file"
        ? {
            ...options.logging,
            onAgentStreamEvent: (event: AgentStreamEvent) => {
              // StructuredOutputError omits stdout; collect the same terminal result the SDK uses.
              if (event.type === "text") text += event.message;
              if (event.type === "raw") {
                for (const parsed of options.agent.parseStreamLine(event.line)) {
                  if (parsed.type === "result") terminal = parsed.result;
                }
              }
            },
          }
        : options.logging;
    try {
      result = await runAgent({ ...options, prompt, logging, output, maxIterations: 1, resumeSession: session });
    } catch (error) {
      if (!(error instanceof StructuredOutputError) || error.tag !== output.tag || error.rawMatched !== undefined)
        throw error;
      const stdout = terminal || text;
      if (hasCompletion(stdout)) {
        if (!resume || !error.sessionId || stdout.includes("<pr-body>") || stdout.includes("</pr-body>")) throw error;
        const verifiedHead = await observe();
        const supplemental = await runAgent({
          ...options,
          maxIterations: 1,
          resumeSession: error.sessionId,
          output,
          prompt:
            "Your completed verification is recorded. Re-emit only the missing <pr-body>...</pr-body> draft. Leave files and GitHub unchanged.",
        });
        if ((await observe()) !== verifiedHead) throw new Error("PR draft follow-up modified the verified candidate.");
        return { repairSummary: stdout, prBody: nonemptyBody(supplemental) };
      }
      if (turn === turns || !error.sessionId)
        throw new Error("Repair did not complete verification.", { cause: error });
      session = error.sessionId;
      continue;
    }
    if (completed(result)) return { repairSummary: result.stdout, prBody: nonemptyBody(result) };
    if (turn < turns) session = nextSession(result, "Repair");
  }
  throw new Error("Repair did not complete verification.");
}

function nonemptyBody(result: AgentResult) {
  const body = result.output;
  if (typeof body !== "string" || !body.trim()) throw new Error("Repair returned an empty PR draft.");
  return body.trim();
}
