import type { OwnedCommandOptions, OwnedCommandResult } from "./owned-command.mjs";

export type ManagedResourceProviderName = "docker" | "native" | "external";

export type ManagedComposeStack = {
  project: string;
  composeFile: string;
  composeEnvironmentFile: string;
  services: string[];
  removeLocalImages: boolean;
  status: "created" | "initializing" | "ready" | "cleaning" | "cleaned" | "cleanup-failed" | "kept";
};

export type ManagedResourceEndpoints = {
  postgres?: { databaseUrl: string; templateName: string };
  redis?: { url: string; host: string; port: number };
  apisix?: { adminUrl: string; adminKey: string };
};

export type ManagedResourceRecord = {
  schemaVersion: 1;
  provider?: ManagedResourceProviderName;
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
  endpoints?: ManagedResourceEndpoints;
  apisix?: ManagedComposeStack;
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
  provider?: ManagedResourceProviderName;
  composeFile?: string;
  project?: string;
  projectPrefix?: string;
  artifactDirectory?: string;
  composeEnvironment?: Readonly<Record<string, string>>;
  services?: readonly string[];
  removeLocalImages?: boolean;
  keep?: boolean;
  registryFile?: string;
  /** @deprecated Ignored; kept temporarily for legacy e2e/system typecheck until #445 removes hybrid-middleware. */
  parentRecord?: string;
}): Promise<ManagedResourceRun>;
export function readManagedResourceRun(root: string, recordPath: string): Promise<ManagedResourceRun>;
export function readManagedResourceRegistry(root: string, registryFile: string): Promise<string[]>;
export function managedComposeStackView(run: ManagedResourceRun, stack: ManagedComposeStack): ManagedResourceRun;
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
export function managedServiceEndpoint(
  run: ManagedResourceRun,
  service: string,
  port: number,
  options?: ManagedComposeCommandOptions,
): Promise<{ host: string; port: number }>;
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
  options?: { cleanupTimeoutMs?: number; diagnostics?: boolean },
): Promise<void>;
export function formatResourceFailure(error: unknown): string;
