import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import { z } from "zod";

/** Only the Ops entrypoint loads this file; inherited process variables take precedence. */
export function loadOpsEnvironment() {
  try {
    const values = parseEnv(readFileSync(new URL("../.env", import.meta.url), "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

const optionalRedisCredential = z
  .string()
  .optional()
  .transform((value) => value || undefined);
const logging = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IAM_OPS_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  IAM_OPS_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
};
const postgres = {
  IAM_OPS_DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/iu.test(value)),
};
const RawOpsEnvSchema = z.object({
  IAM_OPS_DATABASE_URL: postgres.IAM_OPS_DATABASE_URL,
  NODE_ENV: logging.NODE_ENV,
  IAM_OPS_LOG_LEVEL: logging.IAM_OPS_LOG_LEVEL,
  IAM_OPS_LOG_FORMAT: logging.IAM_OPS_LOG_FORMAT,
});
const redis = {
  IAM_OPS_REDIS_HOST: z.string().trim().min(1),
  IAM_OPS_REDIS_PORT: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(1).max(65535)),
  IAM_OPS_REDIS_DB: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().min(0).max(2147483647)),
  IAM_OPS_REDIS_PASSWORD: optionalRedisCredential,
  IAM_OPS_REDIS_USERNAME: optionalRedisCredential,
};
const userDocument = {
  IAM_OPS_USER_DOCUMENT_REBUILD_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  IAM_OPS_USER_DOCUMENT_BACKFILL_BATCH_SIZE: z.coerce.number().int().positive().default(500),
};

function parse<T extends z.ZodType>(schema: T, source: NodeJS.ProcessEnv): z.output<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    // Never render supplied values or Zod's raw input in operator output.
    process.stderr.write(`Invalid Ops configuration: ${keys.join(", ")}\n`);
    throw new Error("Invalid Ops configuration");
  }
  return result.data;
}

export function parseOfflineMaintenanceEnv(source: NodeJS.ProcessEnv) {
  const raw = parse(z.object(redis), source);
  return {
    host: raw.IAM_OPS_REDIS_HOST,
    port: raw.IAM_OPS_REDIS_PORT,
    db: raw.IAM_OPS_REDIS_DB,
    password: raw.IAM_OPS_REDIS_PASSWORD,
    username: raw.IAM_OPS_REDIS_USERNAME,
  };
}
export function parseEmploymentCommandEnv(source: NodeJS.ProcessEnv) {
  const raw = parse(RawOpsEnvSchema, source);
  return {
    databaseUrl: raw.IAM_OPS_DATABASE_URL,
    nodeEnv: raw.NODE_ENV,
    log: { level: raw.IAM_OPS_LOG_LEVEL, format: raw.IAM_OPS_LOG_FORMAT },
  };
}
export function parseAuditActionMaintenanceCommandEnv(source: NodeJS.ProcessEnv) {
  const raw = parse(z.object(postgres), source);
  return { databaseUrl: raw.IAM_OPS_DATABASE_URL };
}
export function parseUserDocumentPostgresReadinessCommandEnv(source: NodeJS.ProcessEnv) {
  const raw = parse(z.object({ ...postgres, ...logging, ...userDocument }), source);
  return {
    databaseUrl: raw.IAM_OPS_DATABASE_URL,
    nodeEnv: raw.NODE_ENV,
    log: { level: raw.IAM_OPS_LOG_LEVEL, format: raw.IAM_OPS_LOG_FORMAT },
    userDocument: {
      rebuildBatchSize: raw.IAM_OPS_USER_DOCUMENT_REBUILD_BATCH_SIZE,
      backfillBatchSize: raw.IAM_OPS_USER_DOCUMENT_BACKFILL_BATCH_SIZE,
    },
  };
}
export function parseUserDocumentCommandEnv(source: NodeJS.ProcessEnv) {
  const base = parseUserDocumentPostgresReadinessCommandEnv(source);
  const raw = parse(
    z.object({
      IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
    }),
    source,
  );
  return {
    ...base,
    redis: parseOfflineMaintenanceEnv(source),
    userDocument: { ...base.userDocument, repairStaleSeconds: raw.IAM_OPS_USER_DOCUMENT_REPAIR_STALE_SECONDS },
  };
}
export type UserDocumentCommandEnv = ReturnType<typeof parseUserDocumentCommandEnv>;

export function parseOrganizationDocumentVerifyCommandEnv(source: NodeJS.ProcessEnv) {
  return parseEmploymentCommandEnv(source);
}
export function parseOrganizationDocumentBackfillCommandEnv(source: NodeJS.ProcessEnv) {
  const prefix = source.IAM_OPS_ORGANIZATION_DOCUMENT_QUEUE_PREFIX;
  if (prefix !== undefined && prefix !== DEFAULT_QUEUE_PREFIX)
    throw new RangeError(`Organization Search queue prefix is fixed to ${DEFAULT_QUEUE_PREFIX}`);
  const raw = parse(
    z.object({
      IAM_OPS_ORGANIZATION_DOCUMENT_BACKFILL_BATCH_SIZE: z.coerce.number().int().positive().default(500),
      IAM_OPS_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
    }),
    source,
  );
  return {
    ...parseEmploymentCommandEnv(source),
    redis: parseOfflineMaintenanceEnv({
      ...source,
      IAM_OPS_REDIS_PORT: source.IAM_OPS_REDIS_PORT ?? "6379",
      IAM_OPS_REDIS_DB: source.IAM_OPS_REDIS_DB ?? "0",
    }),
    organizationDocument: {
      backfillBatchSize: raw.IAM_OPS_ORGANIZATION_DOCUMENT_BACKFILL_BATCH_SIZE,
      repairStaleSeconds: raw.IAM_OPS_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS,
    },
  };
}
export type OrganizationDocumentBackfillCommandEnv = ReturnType<typeof parseOrganizationDocumentBackfillCommandEnv>;
export type OrganizationDocumentVerifyCommandEnv = ReturnType<typeof parseOrganizationDocumentVerifyCommandEnv>;
