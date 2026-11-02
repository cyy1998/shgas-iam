import { parseArgs } from "node:util";
import { runMaintenanceCommandWithLifecycle } from "@iam/api-core/maintenance";
import type { UserDocumentRepairOptions } from "@iam/user-document/maintenance";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";

interface UserDocumentRepairCliOptions extends UserDocumentRepairOptions {
  deadlineMs: number;
  subjectAccessOnly?: boolean;
}

export function parseUserDocumentRepairArgs(argv: string[]): UserDocumentRepairCliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      "stale-before": { type: "string" },
      limit: { type: "string" },
      "subject-access-only": { type: "boolean" },
      "deadline-ms": { type: "string" },
      "retry-user-id": { type: "string" },
      "retry-version": { type: "string" },
      force: { type: "boolean" },
    },
    strict: true,
  });

  const limit = values.limit === undefined ? undefined : Number(values.limit);
  const staleBefore = values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]);
  const retryUserId = values["retry-user-id"] === undefined ? undefined : Number(values["retry-user-id"]);
  const retryVersion = values["retry-version"];
  if (values.force && (retryUserId !== undefined || retryVersion !== undefined || values["subject-access-only"]))
    throw new RangeError("force cannot be combined with targeted retry or subject-access-only");
  if (
    (retryUserId === undefined) !== (retryVersion === undefined) ||
    (retryUserId !== undefined && (!Number.isSafeInteger(retryUserId) || retryUserId < 1)) ||
    (retryVersion !== undefined && !/^[1-9]\d*$/.test(retryVersion)) ||
    (retryUserId !== undefined && values["subject-access-only"])
  )
    throw new RangeError(
      "Explicit retry requires a positive retry-user-id and canonical retry-version without subject-access-only",
    );
  if (
    (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) ||
    (staleBefore !== undefined && !Number.isFinite(staleBefore.getTime()))
  )
    throw new RangeError("repair requires a positive safe limit and valid stale-before");
  return {
    deadlineMs: parseDocumentCommandDeadline(values["deadline-ms"]),
    staleBefore: values["stale-before"] === undefined ? undefined : new Date(values["stale-before"]),
    limit: values.limit === undefined ? undefined : Number(values.limit),
    subjectAccessOnly: values["subject-access-only"],
    ...(values.force ? { force: true } : {}),
    ...(retryUserId !== undefined && retryVersion !== undefined
      ? { retryPostPublication: { userId: retryUserId, version: retryVersion } }
      : {}),
  };
}

async function main(args: string[]) {
  const options = parseUserDocumentRepairArgs(args);
  const { parseUserDocumentCommandEnv } = await import("@ops/env");
  const env = parseUserDocumentCommandEnv(process.env);
  const { createLogger, LoggerSourceApp } = await import("@iam/api-core/logger");
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const { createUserDocumentCommandComposition } = await import("@ops/composition/user-document-command");
  const composition = createUserDocumentCommandComposition({
    env,
    logger,
    deadlineMs: options.deadlineMs,
    subjectAccessOnly: options.subjectAccessOnly,
  });
  const report = await runMaintenanceCommandWithLifecycle({
    signals: process,
    deadlineMs: options.deadlineMs,
    shutdown: composition.shutdown,
    run: async (signal) => {
      await composition.connect();
      if (options.subjectAccessOnly) return await composition.repairSubjectAccess({ ...options, signal });
      return await composition.repair({ ...options, signal });
    },
  });
  if (report.subjectAccess.failed || report.transitionRecovery.failed) process.exitCode = 1;
}
export async function run(args: string[]) {
  try {
    await main(args);
  } catch {
    process.exitCode = process.exitCode || 1;
    process.stderr.write("User Document repair failed; durable work remains for retry.\n");
  }
}
