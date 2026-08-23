import type { MaintenanceOperation } from "@iam/api-core/utils/maintenance-command";
import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { runJsonMaintenanceCommand } from "@iam/api-core/utils/maintenance-command";
import { ClientProtocolCutoverManifestSchema } from "@iam/domain/client";

export async function runClientProtocolEpochCommand(
  deps: {
    cutover: {
      dryRun: (manifest: ClientProtocolCutoverManifest, inventory: Awaited<ReturnType<InventoryPort["readInventory"]>>) => Promise<Report>;
      apply: (manifest: ClientProtocolCutoverManifest) => Promise<Report>;
      verify: (manifest: ClientProtocolCutoverManifest, inventory: Awaited<ReturnType<InventoryPort["readInventory"]>>) => Promise<Report>;
    };
    inventory: InventoryPort;
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  options: { operation: MaintenanceOperation; manifest: ClientProtocolCutoverManifest },
) {
  const report = options.operation === "apply"
    ? await deps.cutover.apply(options.manifest)
    : options.operation === "dry-run"
      ? await deps.cutover.dryRun(options.manifest, await deps.inventory.readInventory())
      : await deps.cutover.verify(options.manifest, await deps.inventory.readInventory());
  deps.logger.info(report, `Client Protocol epoch ${options.operation} completed`);
  return report;
}

interface InventoryPort {
  readInventory: () => Promise<Array<{
    clientCode: string;
    customSsoConfigured: boolean;
    customSsoEpoch: number;
    oidcConfigured: boolean;
    oidcEpoch: number;
  }>>;
}

interface Report {
  status: "failed" | "passed";
  [key: string]: unknown;
}

async function main() {
  await runJsonMaintenanceCommand({
    argv: process.argv.slice(2),
    commandName: "Client Protocol epoch maintenance",
    createComposition: async () => {
      const { parseWorkerEnv } = await import("@worker/env");
      const env = parseWorkerEnv(process.env);
      const { logger } = await import("@worker/lib/logger");
      const { createClientProtocolEpochCommandComposition } = await import("@worker/composition");
      return createClientProtocolEpochCommandComposition({ env, logger });
    },
    execute: runClientProtocolEpochCommand,
    failureMessage: "Client Protocol epoch maintenance failed; inspect structured logs for the safe report.\n",
    parseManifest: ClientProtocolCutoverManifestSchema.parse,
    process: {
      setFailed: () => process.exitCode = 1,
      writeError: message => process.stderr.write(message),
    },
  });
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- Bun keeps the command alive through shutdown.
  await main();
}
