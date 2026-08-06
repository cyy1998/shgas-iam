import { readFile } from "node:fs/promises";
import { runBoundedOperation } from "./bounded-operation.ts";

export interface RecoveryTargetInput {
  descriptorPath?: string;
  project?: string;
}

export interface RecoveryOptions {
  abortSettleTimeoutMs?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const exactProjectPattern = /^iam-e2e-[a-z0-9][a-z0-9-]{7,62}$/u;
const defaultRecoveryTimeoutMs = 120_000;

export async function recoverExactProject(
  input: RecoveryTargetInput,
  cleanup: (project: string, signal: AbortSignal) => Promise<unknown>,
  options: RecoveryOptions = {},
) {
  const hasDescriptor = input.descriptorPath !== undefined;
  const hasProject = input.project !== undefined;
  if (hasDescriptor === hasProject) {
    throw new Error(
      "recovery requires exactly one explicit --descriptor or --project target",
    );
  }

  const project = input.project === undefined
    ? await readProjectFromDescriptor(input.descriptorPath!)
    : assertExactProject(input.project);
  const timeoutMs = options.timeoutMs ?? defaultRecoveryTimeoutMs;
  await runBoundedOperation(signal => cleanup(project, signal), {
    abortSettleTimeoutMs: options.abortSettleTimeoutMs,
    parentSignal: options.signal,
    timeoutMessage: `E2E explicit recovery cleanup timed out after ${timeoutMs}ms`,
    timeoutMs,
  });
  return project;
}

export function assertExactProject(project: string) {
  if (!exactProjectPattern.test(project))
    throw new Error("recovery project must be one exact E2E project name");
  return project;
}

async function readProjectFromDescriptor(descriptorPath: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(descriptorPath, "utf8"));
  }
  catch (error) {
    throw new Error("failed to read the explicit E2E run descriptor", {
      cause: error,
    });
  }
  if (!isRecord(parsed) || parsed.version !== 1)
    throw new Error("explicit E2E run descriptor has an unsupported shape");
  const runId = parsed.runId;
  const project = parsed.project;
  const labels = parsed.labels;
  if (
    typeof runId !== "string"
    || typeof project !== "string"
    || project !== `iam-e2e-${runId}`
    || !isRecord(labels)
    || labels["com.docker.compose.project"] !== project
    || labels["com.shgas-iam.e2e.run-id"] !== runId
  ) {
    throw new Error("explicit E2E run descriptor does not name one exact project");
  }
  return assertExactProject(project);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
