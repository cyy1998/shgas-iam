import type { ClientRuntimeSnapshotVerifier } from "@iam/api-core/client-runtime-snapshot";
import { parseArgs } from "node:util";
import {
  clientRuntimeMaintenanceExitCode,
  emitClientRuntimeMaintenanceReport,
  resolveClientRuntimeFullMaintenanceTimeoutMs,
  runBoundedClientRuntimeMaintenance,
} from "./client-runtime-maintenance-command";

const DEFAULT_VERIFY_TIMEOUT_MS = 5 * 60_000;

export interface ClientRuntimeVerifyReport {
  readonly schemaVersion: 1;
  readonly operation: "verify-all";
  readonly status: "completed" | "failed";
  readonly matchingKeys?: number;
}

interface ClientRuntimeVerifyCommandDeps {
  readonly verifier: ClientRuntimeSnapshotVerifier;
}

export async function runClientRuntimeVerifyCommand(
  deps: ClientRuntimeVerifyCommandDeps,
  options: {
    protocolTrafficStopped: true;
    reportSink: (serializedReport: string) => void;
    timeoutMs?: number;
  },
): Promise<ClientRuntimeVerifyReport> {
  const outcome = await runBoundedClientRuntimeMaintenance(
    async () => await deps.verifier.verifyAllAfterRedisRestore({
      protocolTrafficStopped: options.protocolTrafficStopped,
    }),
    options.timeoutMs ?? DEFAULT_VERIFY_TIMEOUT_MS,
  );
  const report: ClientRuntimeVerifyReport = {
    schemaVersion: 1,
    operation: "verify-all",
    status: outcome.status === "completed" && outcome.value.matchingKeys === 0
      ? "completed"
      : "failed",
    ...(outcome.status === "completed"
      ? { matchingKeys: outcome.value.matchingKeys }
      : {}),
  };
  emitClientRuntimeMaintenanceReport(report, options.reportSink);
  return report;
}

export const clientRuntimeVerifyExitCode = clientRuntimeMaintenanceExitCode;

export function parseClientRuntimeVerifyArgs(argv: string[]) {
  const allOptionCount = argv.filter(argument => argument === "--all").length;
  const trafficStoppedOptionCount = argv.filter(argument => argument === "--protocol-traffic-stopped").length;
  parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      "all": { type: "boolean" },
      "protocol-traffic-stopped": { type: "boolean" },
    },
    strict: true,
  });
  if (allOptionCount !== 1 || trafficStoppedOptionCount !== 1)
    throw new Error("Full verify requires --all and --protocol-traffic-stopped exactly once");
  return { protocolTrafficStopped: true } as const;
}

async function main() {
  const options = parseClientRuntimeVerifyArgs(process.argv.slice(2));
  const { parseClientRuntimeMaintenanceCommandEnv } = await import("@worker/env");
  const env = parseClientRuntimeMaintenanceCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createClientRuntimeVerifyCommandComposition } = await import("@worker/composition/client-runtime-verify");
  const composition = createClientRuntimeVerifyCommandComposition({ env, logger });
  try {
    const report = await runClientRuntimeVerifyCommand(
      { verifier: composition.verifier },
      {
        ...options,
        timeoutMs: resolveClientRuntimeFullMaintenanceTimeoutMs(
          process.env,
          DEFAULT_VERIFY_TIMEOUT_MS,
        ),
        reportSink(serializedReport) {
          process.stdout.write(serializedReport);
        },
      },
    );
    process.exitCode = clientRuntimeVerifyExitCode(report);
  }
  finally {
    await composition.shutdown("command:client-runtime:verify");
  }
}

if (import.meta.main) {
  try {
    // eslint-disable-next-line antfu/no-top-level-await -- Bun must keep the command alive through shutdown.
    await main();
  }
  catch {
    process.exitCode = 1;
    process.stderr.write(
      "Client Runtime restore verify failed; inspect structured logs for the safe report.\n",
    );
  }
}
