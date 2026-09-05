import type {
  ClientRuntimeSnapshotRestoreRepair,
  ClientRuntimeSnapshotTargetedMaintenance,
} from "@iam/api-core/client-runtime-snapshot";
import { parseArgs } from "node:util";
import { ClientCodeSchema } from "@iam/contracts";
import {
  clientRuntimeMaintenanceExitCode,
  emitClientRuntimeMaintenanceReport,
  resolveClientRuntimeFullMaintenanceTimeoutMs,
  runBoundedClientRuntimeMaintenance,
} from "./client-runtime-maintenance-command";

const DEFAULT_TARGETED_REPAIR_TIMEOUT_MS = 10_000;
const DEFAULT_FULL_REPAIR_TIMEOUT_MS = 5 * 60_000;

export interface ClientRuntimeTargetedRepairReport {
  readonly schemaVersion: 1;
  readonly operation: "repair-client";
  readonly status: "completed" | "failed";
  readonly clientCode: string;
}

export interface ClientRuntimeFullRepairReport {
  readonly schemaVersion: 1;
  readonly operation: "repair-all";
  readonly status: "completed" | "failed";
  readonly scannedKeys?: number;
  readonly unlinkedKeys?: number;
  readonly unlinkBatches?: number;
}

export type ClientRuntimeRepairReport
  = | ClientRuntimeTargetedRepairReport
    | ClientRuntimeFullRepairReport;

export type ClientRuntimeRepairTarget
  = | { readonly mode: "client"; readonly clientCode: string }
    | { readonly mode: "all"; readonly protocolTrafficStopped: true };

type ClientRuntimeRepairMaintenance = ClientRuntimeSnapshotTargetedMaintenance
  & ClientRuntimeSnapshotRestoreRepair;

interface ClientRuntimeRepairCommandDeps {
  readonly maintenance: ClientRuntimeRepairMaintenance;
}

export async function runClientRuntimeRepairCommand(
  deps: ClientRuntimeRepairCommandDeps,
  options: {
    target: ClientRuntimeRepairTarget;
    reportSink: (serializedReport: string) => void;
    resolveFullTimeoutMs?: () => number;
    timeoutMs?: number;
  },
): Promise<ClientRuntimeRepairReport> {
  return await createRepairHandler(deps, options.target, options)();
}

export const clientRuntimeRepairExitCode = clientRuntimeMaintenanceExitCode;

export function parseClientRuntimeRepairArgs(argv: string[]) {
  const clientCodeOptionCount = argv.filter(argument =>
    argument === "--client-code" || argument.startsWith("--client-code=")).length;
  const allOptionCount = argv.filter(argument => argument === "--all").length;
  const trafficStoppedOptionCount = argv.filter(argument => argument === "--protocol-traffic-stopped").length;

  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    options: {
      "client-code": { type: "string" },
      "all": { type: "boolean" },
      "protocol-traffic-stopped": { type: "boolean" },
    },
    strict: true,
  });
  if (clientCodeOptionCount === 1 && allOptionCount === 0 && trafficStoppedOptionCount === 0) {
    return {
      mode: "client",
      clientCode: ClientCodeSchema.parse(values["client-code"]),
    } as const;
  }
  if (clientCodeOptionCount === 0 && allOptionCount === 1 && trafficStoppedOptionCount === 1) {
    return {
      mode: "all",
      protocolTrafficStopped: true,
    } as const;
  }
  throw new Error("Choose exactly one targeted or confirmed full repair mode");
}

function createRepairHandler(
  deps: ClientRuntimeRepairCommandDeps,
  target: ClientRuntimeRepairTarget,
  options: {
    reportSink: (serializedReport: string) => void;
    resolveFullTimeoutMs?: () => number;
    timeoutMs?: number;
  },
): () => Promise<ClientRuntimeRepairReport> {
  switch (target.mode) {
    case "client":
      return async () => {
        const outcome = await runBoundedClientRuntimeMaintenance(
          async () => await deps.maintenance.repairClient(target.clientCode),
          options.timeoutMs ?? DEFAULT_TARGETED_REPAIR_TIMEOUT_MS,
        );
        const report: ClientRuntimeTargetedRepairReport = {
          schemaVersion: 1,
          operation: "repair-client",
          status: outcome.status,
          clientCode: target.clientCode,
        };
        emitClientRuntimeMaintenanceReport(report, options.reportSink);
        return report;
      };
    case "all":
      return async () => {
        const outcome = await runBoundedClientRuntimeMaintenance(
          async () => await deps.maintenance.repairAllAfterRedisRestore({
            protocolTrafficStopped: target.protocolTrafficStopped,
          }),
          options.timeoutMs
          ?? options.resolveFullTimeoutMs?.()
          ?? DEFAULT_FULL_REPAIR_TIMEOUT_MS,
        );
        const report: ClientRuntimeFullRepairReport = {
          schemaVersion: 1,
          operation: "repair-all",
          status: outcome.status,
          ...(outcome.status === "completed" ? outcome.value : {}),
        };
        emitClientRuntimeMaintenanceReport(report, options.reportSink);
        return report;
      };
  }
}

async function main() {
  const target = parseClientRuntimeRepairArgs(process.argv.slice(2));
  const { parseClientRuntimeMaintenanceCommandEnv } = await import("@worker/env");
  const env = parseClientRuntimeMaintenanceCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Worker,
  });
  const { createClientRuntimeRepairCommandComposition } = await import("@worker/composition/client-runtime-repair");
  const composition = createClientRuntimeRepairCommandComposition({ env, logger });
  try {
    const report = await runClientRuntimeRepairCommand({
      maintenance: composition.maintenance,
    }, {
      target,
      resolveFullTimeoutMs: () => resolveClientRuntimeFullMaintenanceTimeoutMs(
        process.env,
        DEFAULT_FULL_REPAIR_TIMEOUT_MS,
      ),
      reportSink(serializedReport) {
        process.stdout.write(serializedReport);
      },
    });
    process.exitCode = clientRuntimeRepairExitCode(report);
  }
  finally {
    await composition.shutdown("command:client-runtime:repair");
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
      "Client Runtime repair failed; inspect structured logs for the safe report.\n",
    );
  }
}
