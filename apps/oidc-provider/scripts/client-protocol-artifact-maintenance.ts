import type { MaintenanceOperation } from "@iam/api-core/utils/maintenance-command";
import type { ClientProtocolCutoverManifest } from "@iam/domain/client";
import { fileURLToPath } from "node:url";
import { runJsonMaintenanceCommand } from "@iam/api-core/utils/maintenance-command";
import { ClientProtocolCutoverManifestSchema } from "@iam/domain/client";

interface CleanupPort {
  dryRun: (manifest: ClientProtocolCutoverManifest) => Promise<CleanupReport>;
  apply: (manifest: ClientProtocolCutoverManifest) => Promise<CleanupReport>;
  verify: (manifest: ClientProtocolCutoverManifest) => Promise<CleanupReport>;
}

interface CleanupReport {
  status: "failed" | "passed";
  [key: string]: unknown;
}

async function runClientProtocolArtifactCommand(
  deps: {
    cleanup: CleanupPort;
    logger: { info: (data: Record<string, unknown>, message: string) => void };
  },
  options: { operation: MaintenanceOperation; manifest: ClientProtocolCutoverManifest },
) {
  const report = options.operation === "dry-run"
    ? await deps.cleanup.dryRun(options.manifest)
    : options.operation === "apply"
      ? await deps.cleanup.apply(options.manifest)
      : await deps.cleanup.verify(options.manifest);
  deps.logger.info(report, `Client Protocol artifact ${options.operation} completed`);
  return report;
}

async function main() {
  await runJsonMaintenanceCommand({
    argv: process.argv.slice(2),
    commandName: "Client Protocol artifact maintenance",
    createComposition: async () => {
      const { parseOidcProviderEnv } = await import("../src/env.ts");
      const env = parseOidcProviderEnv(process.env);
      const { createLogger } = await import("../src/lib/logger.ts");
      const { createOidcProtocolArtifactCommandComposition } = await import("../src/composition/index.ts");
      return createOidcProtocolArtifactCommandComposition({
        env,
        logger: createLogger(env),
      });
    },
    execute: runClientProtocolArtifactCommand,
    failureMessage: "Client Protocol artifact maintenance failed; inspect structured logs for the safe report.\n",
    parseManifest: ClientProtocolCutoverManifestSchema.parse,
    process: {
      setFailed: () => process.exitCode = 1,
      writeError: message => process.stderr.write(message),
    },
  });
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
