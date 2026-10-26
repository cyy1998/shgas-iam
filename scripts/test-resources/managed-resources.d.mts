import type { OwnedCommandOptions, OwnedCommandResult } from "./owned-command.mjs";

export type ManagedResourceRecord = {
  schemaVersion: 1;
  runId: string;
  project: string;
  composeFile: string;
  artifactDirectory: string;
  composeEnvironmentFile: string;
  envFile: string;
  testEnvironmentFile: string;
  services: string[];
  removeLocalImages: boolean;
  keep: boolean;
  status: "created" | "initializing" | "ready" | "running" | "cleaning" | "cleaned" | "cleanup-failed" | "kept";
  createdAt: string;
  durations: { createMs?: number; executeMs?: number; cleanupMs?: number };
};
export type ManagedResourceRun = { root: string; recordPath: string; record: ManagedResourceRecord };
export type ManagedComposeCommandOptions = Omit<OwnedCommandOptions, "executable" | "args" | "cwd" | "env"> & {
  runCommand?: (options: OwnedCommandOptions) => Promise<OwnedCommandResult>;
};
export function repositoryPath(root: string, path: string): string;
export function saveManagedResourceRun(run: ManagedResourceRun): Promise<void>;
export function writeAtomicResourceRecord(destination: string, record: unknown): Promise<void>;
export function createManagedResourceRun(options: {
  root: string;
  composeFile: string;
  project?: string;
  projectPrefix?: string;
  artifactDirectory?: string;
  composeEnvironment?: Readonly<Record<string, string>>;
  services?: readonly string[];
  removeLocalImages?: boolean;
  keep?: boolean;
  registryFile?: string;
}): Promise<ManagedResourceRun>;
export function readManagedResourceRun(root: string, recordPath: string): Promise<ManagedResourceRun>;
export function readManagedResourceRegistry(root: string, registryFile: string): Promise<string[]>;
export function managedComposeArguments(run: ManagedResourceRun, args: readonly string[]): string[];
export function runManagedComposeCommand(
  run: ManagedResourceRun,
  args: readonly string[],
  options?: ManagedComposeCommandOptions,
): Promise<OwnedCommandResult>;
export function startManagedResources(run: ManagedResourceRun, options?: ManagedComposeCommandOptions): Promise<void>;
export function managedServicePort(
  run: ManagedResourceRun,
  service: string,
  port: number,
  options?: ManagedComposeCommandOptions,
): Promise<number>;
export function collectManagedResourceDiagnostics(
  run: ManagedResourceRun,
  options?: ManagedComposeCommandOptions,
): Promise<void>;
export function managedCleanupCommand(run: ManagedResourceRun): string;
export function cleanupManagedResources(
  run: ManagedResourceRun,
  options?: { timeoutMs?: number; respectKeep?: boolean; runCommand?: ManagedComposeCommandOptions["runCommand"] },
): Promise<void>;
export function finishManagedResourceRun(
  run: ManagedResourceRun,
  options?: { cleanupTimeoutMs?: number },
): Promise<void>;
export function formatResourceFailure(error: unknown): string;
