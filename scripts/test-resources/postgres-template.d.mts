import type { ManagedResourceRun } from "./managed-resources.mjs";
import type { OwnedCommandOptions } from "./owned-command.mjs";

export function prepareManagedPostgresTemplate(
  run: ManagedResourceRun,
  options: Pick<OwnedCommandOptions, "env" | "signal" | "timeoutMs" | "cleanupTimeoutMs">,
): Promise<{ databaseUrl: string; templateName: string }>;
