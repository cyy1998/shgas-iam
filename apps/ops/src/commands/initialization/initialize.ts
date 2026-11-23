import { parseArgs } from "node:util";
import { createMaintenancePostgresResources } from "@iam/db/maintenance";
import { createLogger, LoggerSourceApp } from "@iam/runtime/logger";
import {
  closeMaintenanceResources,
  createOfflineMaintenanceRedis,
  runMaintenanceCommandWithLifecycle,
} from "@iam/runtime/maintenance";
import { completePublishedInitializationAccess } from "@ops/composition/initialization-access";
import { createOrganizationDocumentBackfillCommandComposition } from "@ops/composition/organization-document-command";
import { createUserDocumentCommandComposition } from "@ops/composition/user-document-command";
import {
  parseOfflineMaintenanceEnv,
  parseOrganizationDocumentBackfillCommandEnv,
  parseUserDocumentCommandEnv,
  parseUserDocumentPostgresReadinessCommandEnv,
} from "@ops/env";
import { parseDocumentCommandDeadline } from "../document-command-lifecycle";
import { InitializationInputSchema, resolveInitializationSecrets } from "./initialization-input";
import { initializeSourceFacts, verifyInitializationSource } from "./initialization-source";

async function main(args: string[]) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { input: { type: "string" }, "deadline-ms": { type: "string" } },
  });
  const [operation] = positionals;
  if (positionals.length !== 1 || (operation !== "source" && operation !== "access") || !values.input)
    throw new Error("initialization-invalid-arguments");
  const input = InitializationInputSchema.parse(await Bun.file(values.input).json());
  const secrets = resolveInitializationSecrets(process.env);
  const deadlineMs = parseDocumentCommandDeadline(values["deadline-ms"]);
  const env = parseUserDocumentPostgresReadinessCommandEnv(process.env);
  const logger = createLogger({
    nodeEnv: env.nodeEnv,
    logLevel: env.log.level,
    logFormat: env.log.format,
    sourceApp: LoggerSourceApp.Ops,
  });
  const shutdowns: Array<(reason: string) => void | Promise<void>> = [];
  const result = await runMaintenanceCommandWithLifecycle({
    signals: process,
    deadlineMs,
    shutdown: (reason) =>
      closeMaintenanceResources(shutdowns.map((shutdown) => Promise.resolve().then(() => shutdown(reason)))),
    async run(signal) {
      const postgres = createMaintenancePostgresResources({ databaseUrl: env.databaseUrl, deadlineMs, scope: "user" });
      shutdowns.push(postgres.close);
      if (operation === "source") {
        const userEnv = parseUserDocumentCommandEnv(process.env);
        const organizationEnv = parseOrganizationDocumentBackfillCommandEnv(process.env);
        const user = createUserDocumentCommandComposition({ env: userEnv, logger, deadlineMs });
        shutdowns.push(user.shutdown);
        const organization = createOrganizationDocumentBackfillCommandComposition({
          env: organizationEnv,
          logger,
          deadlineMs,
        });
        shutdowns.push(organization.shutdown);
        const source = await initializeSourceFacts(postgres.db, input, secrets);
        signal.throwIfAborted();
        if (!user.maintenance) throw new Error("initialization-backfill-unavailable");
        const userDocument = await user.maintenance.backfillAllUsers({
          batchSize: userEnv.userDocument.backfillBatchSize,
          signal,
        });
        const organizationDocument = await organization.processor.backfillAllOrganizations({
          batchSize: organizationEnv.organizationDocument.backfillBatchSize,
          signal,
        });
        return { ...source, userDocument, organizationDocument, publication: "not-verified" };
      }

      const redis = createOfflineMaintenanceRedis(parseOfflineMaintenanceEnv(process.env), signal);
      shutdowns.push(() => redis.close());
      const source = await verifyInitializationSource(postgres.db, input, secrets);
      await redis.connect();
      const access = await completePublishedInitializationAccess({
        db: postgres.db,
        runtime: { redis: redis.redis, clock: { nowDate: () => new Date(), now: Date.now } },
        source,
        username: input.admin.username,
        config: { buildBatchSize: env.userDocument.rebuildBatchSize, batchSize: env.userDocument.backfillBatchSize },
        signal,
      });
      return { ...source, ...access, access: "verified" };
    },
  });
  logger.info(
    result,
    operation === "source" ? "IAM initialization source committed" : "IAM initialization access completed",
  );
}

export async function run(args: string[]) {
  try {
    await main(args);
  } catch (error) {
    const code =
      error instanceof Error && /^initialization-[a-z-]+$/.test(error.message)
        ? error.message
        : "initialization-failed";
    process.stderr.write(`${code}\n`);
    process.exitCode ||= 1;
  }
}
