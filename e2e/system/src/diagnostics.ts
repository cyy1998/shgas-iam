import type { RunDescriptor } from "./lifecycle.ts";
import { Buffer } from "node:buffer";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runBoundedOperation } from "./bounded-operation.ts";
import { collectPlaywrightEvidence } from "./playwright-evidence.ts";

export interface CollectRunDiagnosticsOptions {
  abortSettleTimeoutMs?: number;
  descriptor: RunDescriptor;
  maxBytesPerArtifact?: number;
  signal?: AbortSignal;
  sourceTimeoutMs?: number;
  readComposePs: (signal: AbortSignal) => Promise<DiagnosticSourceValue>;
  readRecentLogs: (signal: AbortSignal) => Promise<DiagnosticSourceValue>;
  readGatewayState: (signal: AbortSignal) => Promise<DiagnosticSourceValue>;
  readPlaywrightEvidence?: (
    descriptor: RunDescriptor,
    signal: AbortSignal,
  ) => Promise<unknown>;
}

export interface DiagnosticSourceEvidence {
  content: string;
  unavailableSources: string[];
}

export type DiagnosticSourceValue = string | DiagnosticSourceEvidence;

const defaultMaxBytesPerArtifact = 64 * 1024;
const defaultSourceTimeoutMs = 10_000;
const existingEvidenceNames = [
  "migration-receipt.json",
  "seed-receipt.json",
  "hr-admin-outcome-receipt.json",
];

export async function collectRunDiagnostics(
  options: CollectRunDiagnosticsOptions,
) {
  const maxBytes = options.maxBytesPerArtifact ?? defaultMaxBytesPerArtifact;
  if (!Number.isInteger(maxBytes) || maxBytes <= 0)
    throw new Error("diagnostic artifact byte limit must be a positive integer");
  const sourceTimeoutMs = options.sourceTimeoutMs ?? defaultSourceTimeoutMs;
  if (!Number.isInteger(sourceTimeoutMs) || sourceTimeoutMs <= 0)
    throw new Error("diagnostic source timeout must be a positive integer");

  await mkdir(options.descriptor.artifactDirectory, { recursive: true });
  const bounded = <T>(operation: (signal: AbortSignal) => Promise<T>) =>
    runBoundedOperation(operation, {
      abortSettleTimeoutMs: options.abortSettleTimeoutMs,
      parentSignal: options.signal,
      timeoutMessage: `diagnostic source timed out after ${sourceTimeoutMs}ms`,
      timeoutMs: sourceTimeoutMs,
    });
  const readPlaywrightEvidence = options.readPlaywrightEvidence
    ?? ((descriptor: RunDescriptor, signal: AbortSignal) =>
      collectPlaywrightEvidence({ descriptor, signal }));
  const [inventory, playwrightEvidence, ...sources] = await Promise.allSettled([
    bounded(signal => listExistingEvidence(
      options.descriptor.artifactDirectory,
      signal,
    )),
    bounded(signal => readPlaywrightEvidence(options.descriptor, signal)),
    bounded(options.readComposePs),
    bounded(options.readRecentLogs),
    bounded(options.readGatewayState),
  ]);
  const names = ["compose-ps.json", "compose-logs.txt", "gateway-state.json"];
  const existingArtifacts = inventory.status === "fulfilled"
    ? inventory.value
    : [];
  const unavailableSources = [
    ...(inventory.status === "rejected"
      ? ["existing-artifact-inventory"]
      : []),
    ...(playwrightEvidence.status === "rejected"
      ? ["playwright-evidence"]
      : []),
    ...diagnosticSourceFailureNames(sources, names),
  ];

  const artifactWrites = sources.map(async (source, index) => {
    const name = names[index];
    if (name === undefined)
      return;
    const content = source.status === "fulfilled"
      ? diagnosticSourceContent(source.value)
      : `diagnostic source unavailable: ${safeErrorName(source.reason)}`;
    await writeFile(
      join(options.descriptor.artifactDirectory, name),
      boundUtf8(content, maxBytes),
      "utf8",
    );
  });
  if (playwrightEvidence.status === "rejected") {
    artifactWrites.push(writeFile(
      join(options.descriptor.artifactDirectory, "playwright-evidence.json"),
      `${JSON.stringify({
        version: 1,
        status: "unavailable",
        artifacts: [],
      }, null, 2)}\n`,
      "utf8",
    ));
  }
  await Promise.all(artifactWrites);

  const indexPath = join(
    options.descriptor.artifactDirectory,
    "diagnostics-index.json",
  );
  await writeFile(indexPath, `${JSON.stringify({
    version: 1,
    project: options.descriptor.project,
    origin: options.descriptor.origin,
    generatedArtifacts: [...names, "playwright-evidence.json"],
    existingArtifacts,
    unavailableSources,
  }, null, 2)}\n`, "utf8");
  if (unavailableSources.length > 0) {
    throw new AggregateError(
      unavailableSources.map(source => new Error(
        `required diagnostic source ${source} failed`,
      )),
      "required diagnostic source failed",
    );
  }
  return { indexPath };
}

async function listExistingEvidence(root: string, signal: AbortSignal) {
  const results = await Promise.all(existingEvidenceNames.map(async (name) => {
    signal.throwIfAborted();
    try {
      const stats = await lstat(join(root, name));
      signal.throwIfAborted();
      return stats.isFile() && !stats.isSymbolicLink() ? name : undefined;
    }
    catch (error) {
      if (isFileSystemError(error, "ENOENT"))
        return undefined;
      throw error;
    }
  }));
  return results.filter(value => value !== undefined);
}

function diagnosticSourceFailureNames(
  sources: PromiseSettledResult<DiagnosticSourceValue>[],
  names: string[],
) {
  return sources.flatMap((source, index) => {
    const name = names[index] ?? "unknown";
    if (source.status === "rejected")
      return [name];
    if (typeof source.value === "string")
      return [];
    return source.value.unavailableSources.map(
      unavailable => `${name}/${safeSourceName(unavailable)}`,
    );
  });
}

function diagnosticSourceContent(source: DiagnosticSourceValue) {
  return typeof source === "string" ? source : source.content;
}

function safeSourceName(source: string) {
  return /^[a-z\d][a-z\d-]{0,63}$/u.test(source) ? source : "unknown";
}

function boundUtf8(value: string, maxBytes: number) {
  let bounded = Buffer.from(value, "utf8").subarray(0, maxBytes).toString("utf8");
  while (Buffer.byteLength(bounded, "utf8") > maxBytes)
    bounded = bounded.slice(0, -1);
  return bounded;
}

function safeErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}

function isFileSystemError(error: unknown, code: string) {
  return error instanceof Error
    && "code" in error
    && error.code === code;
}
