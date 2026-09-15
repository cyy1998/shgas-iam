import { parseArgs } from "node:util";
import {
  createClientSnapshotMaintenance,
  createClientSnapshotVerifier,
} from "@iam/api-core/client-snapshot/maintenance";
import { ClientCodeSchema } from "@iam/contracts";
import { createOfflineMaintenanceRedis } from "@worker/composition/offline-maintenance-redis";
import { parseOfflineMaintenanceEnv } from "@worker/env";
import { z } from "zod";

export function parseClientSnapshotMaintenanceArgs(argv: string[]) {
  const mode = z.enum(["repair", "verify"]).parse(argv[0]);
  const args = argv[1] === "--" ? argv.slice(2) : argv.slice(1);
  const { values } = parseArgs({
    args,
    strict: true,
    allowPositionals: false,
    options: {
      "all": { type: "boolean" },
      "client-code": { type: "string" },
      "writers-stopped": { type: "boolean" },
      "drained": { type: "boolean" },
      "deadline-ms": { type: "string" },
    },
  });
  const flags = args.filter(value => value.startsWith("--")).map(value => value.split("=")[0]);
  if (new Set(flags).size !== flags.length)
    throw new Error("Repeated maintenance input");
  const clientCode
    = values["client-code"] === undefined ? undefined : ClientCodeSchema.parse(values["client-code"]);
  if (
    clientCode
      ? mode !== "repair" || values.all || values["writers-stopped"] || values.drained
      : !values.all || !values["writers-stopped"] || !values.drained
  ) {
    throw new Error("Explicit maintenance scope required");
  }
  const deadlineMs
    = values["deadline-ms"] === undefined
      ? clientCode
        ? 10_000
        : 300_000
      : z.coerce.number().int().positive().max(300_000).parse(values["deadline-ms"]);
  return { mode, clientCode, deadlineMs };
}

async function main() {
  let input;
  try {
    input = parseClientSnapshotMaintenanceArgs(process.argv.slice(2));
  }
  catch {
    process.stdout.write(`${JSON.stringify({ version: 1, status: "failed", reason: "invalid-input" })}\n`);
    process.exitCode = 2;
    return;
  }
  const report: {
    version: number;
    owner: string;
    mode: string;
    status: string;
    reason: string;
    matching?: number;
    clientCode?: string;
  } = {
    version: 1,
    owner: "client-snapshot-v1",
    mode: input.mode,
    status: "failed",
    reason: "operation-failed",
    ...(input.clientCode ? { clientCode: input.clientCode } : {}),
  };
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, input.deadlineMs);
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);
  let connection: ReturnType<typeof createOfflineMaintenanceRedis> | undefined;
  try {
    connection = createOfflineMaintenanceRedis(parseOfflineMaintenanceEnv(process.env), controller.signal);
    await connection.connect();
    const redis = connection.redis;
    if (input.mode === "verify") {
      const verifier = createClientSnapshotVerifier({
        scan: async (cursor, match, pattern, count, limit) =>
          await redis.scan(cursor, match, pattern, count, limit),
      });
      const result = await verifier.verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
      report.matching = result.matchingKeys;
      if (result.matchingKeys !== 0)
        throw new Error("Snapshot state remains");
    }
    else {
      const owner = createClientSnapshotMaintenance(redis);
      if (input.clientCode)
        await owner.repairClient(input.clientCode);
      else await owner.repairAllAfterRedisRestore({ protocolTrafficStopped: true });
    }
    controller.signal.throwIfAborted();
    report.status = "completed";
    report.reason = "scope-complete";
  }
  catch {
  }
  finally {
    clearTimeout(timer);
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
    connection?.close();
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exitCode = report.status === "completed" ? 0 : 1;
}

if (import.meta.main) {
  // eslint-disable-next-line antfu/no-top-level-await -- CLI owns resources until report and shutdown complete.
  await main();
}
