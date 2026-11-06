import { type RedisConfig, redisUrlString } from "@iam/api-core/redis/config";
import { booleanString, optionalNonEmptyString } from "@iam/api-core/utils/env-schema";
import { DEFAULT_QUEUE_PREFIX } from "@iam/jobs";
import { z } from "zod";

const moduleKeySchema = z.string().trim().min(1);

export type WorkerModuleSelection = {
  mode: "all" | "none" | "list";
  keys: string[];
};

function slashPath(defaultValue: string) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      const path = value?.trim() || defaultValue;
      if (!path.startsWith("/")) {
        ctx.addIssue({ code: "custom", message: `${path} must start with /` });
        return z.NEVER;
      }
      return path.length > 1 ? path.replace(/\/+$/u, "") : path;
    });
}

function moduleSelection(defaultValue: "all" | "none" | string) {
  return z
    .string()
    .optional()
    .transform((value, ctx) => {
      const raw = value?.trim() || defaultValue;
      if (raw === "all" || raw === "none") {
        return { mode: raw, keys: [] } satisfies WorkerModuleSelection;
      }

      const keys = [
        ...new Set(
          raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ];
      if (keys.length === 0) {
        ctx.addIssue({ code: "custom", message: "module selection must be all, none, or a comma-separated list" });
        return z.NEVER;
      }

      for (const key of keys) {
        const parsed = moduleKeySchema.safeParse(key);
        if (!parsed.success) {
          ctx.addIssue({ code: "custom", message: `${key} is not a valid module key` });
          return z.NEVER;
        }
      }

      return { mode: "list", keys } satisfies WorkerModuleSelection;
    });
}

const RawWorkerEnvSchema = z
  .object({
    IAM_WORKER_DATABASE_URL: z.string().min(1),
    IAM_WORKER_REDIS_URL: redisUrlString(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    IAM_WORKER_LOG_LEVEL: z.string().default("info"),
    IAM_WORKER_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
    IAM_WORKER_ENABLED_MODULES: moduleSelection("all"),
    IAM_WORKER_HTTP_ENABLED: booleanString(true),
    IAM_WORKER_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(30003),
    IAM_WORKER_HEALTH_PATH: slashPath("/healthz"),
    IAM_WORKER_BULL_BOARD_ENABLED: booleanString(false),
    IAM_WORKER_BULL_BOARD_PATH: slashPath("/admin/queues"),
    IAM_WORKER_BULL_BOARD_QUEUES: moduleSelection("all"),
    IAM_WORKER_BULL_BOARD_AUTH_ENABLED: booleanString(true),
    IAM_WORKER_BULL_BOARD_USERNAME: optionalNonEmptyString(),
    IAM_WORKER_BULL_BOARD_PASSWORD: optionalNonEmptyString(),
    IAM_WORKER_BULL_BOARD_READ_ONLY: booleanString(true),
    IAM_WORKER_USER_DOCUMENT_CONCURRENCY: z.coerce.number().int().positive().default(2),
    IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE: z.coerce.number().int().positive().default(100),
    IAM_WORKER_USER_DOCUMENT_REPAIR_STALE_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
    IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED: booleanString(false),
    IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS: z.coerce.number().int().positive().max(2_147_483_647).default(60_000),
    IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).default(500),
    IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS: z.coerce.number().int().positive().max(300_000).default(30_000),
    IAM_WORKER_ORGANIZATION_DOCUMENT_CONCURRENCY: z.coerce.number().int().positive().default(2),
    IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
    IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED: booleanString(false),
    IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(2_147_483_647)
      .default(60_000),
    IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT: z.coerce
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .default(500),
    IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS: z.coerce
      .number()
      .int()
      .positive()
      .max(300_000)
      .default(30_000),
  })
  .superRefine((raw, ctx) => {
    if (!raw.IAM_WORKER_BULL_BOARD_ENABLED) return;

    if (raw.NODE_ENV === "production" && !raw.IAM_WORKER_BULL_BOARD_AUTH_ENABLED) {
      ctx.addIssue({
        code: "custom",
        path: ["IAM_WORKER_BULL_BOARD_AUTH_ENABLED"],
        message: "IAM_WORKER_BULL_BOARD_AUTH_ENABLED must be true when dashboard is enabled in production",
      });
    }

    if (
      raw.NODE_ENV === "production" &&
      (raw.IAM_WORKER_BULL_BOARD_USERNAME === undefined || raw.IAM_WORKER_BULL_BOARD_PASSWORD === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["IAM_WORKER_BULL_BOARD_USERNAME"],
        message: "IAM_WORKER_BULL_BOARD_USERNAME and IAM_WORKER_BULL_BOARD_PASSWORD are required in production",
      });
    }
  });

type RawWorkerEnv = z.infer<typeof RawWorkerEnvSchema>;

export interface WorkerEnv {
  databaseUrl: string;
  redis: RedisConfig;
  nodeEnv: "development" | "test" | "production";
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  modules: {
    enabled: WorkerModuleSelection;
  };
  http: {
    enabled: boolean;
    port: number;
    healthPath: string;
  };
  dashboard: {
    enabled: boolean;
    path: string;
    queues: WorkerModuleSelection;
    authEnabled: boolean;
    username?: string;
    password?: string;
    readOnly: boolean;
  };
  userDocument: {
    concurrency: number;
    rebuildBatchSize: number;
    repairStaleSeconds: number;
    repair: {
      enabled: boolean;
      intervalMs: number;
      limit: number;
      deadlineMs: number;
    };
  };
  organizationDocument: {
    concurrency: number;
    repairStaleSeconds: number;
    repair: {
      enabled: boolean;
      intervalMs: number;
      limit: number;
      deadlineMs: number;
    };
  };
}

function toWorkerEnv(raw: RawWorkerEnv): WorkerEnv {
  return {
    databaseUrl: raw.IAM_WORKER_DATABASE_URL,
    redis: raw.IAM_WORKER_REDIS_URL,
    nodeEnv: raw.NODE_ENV,
    log: {
      level: raw.IAM_WORKER_LOG_LEVEL,
      format: raw.IAM_WORKER_LOG_FORMAT,
    },
    modules: {
      enabled: raw.IAM_WORKER_ENABLED_MODULES,
    },
    http: {
      enabled: raw.IAM_WORKER_HTTP_ENABLED,
      port: raw.IAM_WORKER_HTTP_PORT,
      healthPath: raw.IAM_WORKER_HEALTH_PATH,
    },
    dashboard: {
      enabled: raw.IAM_WORKER_BULL_BOARD_ENABLED,
      path: raw.IAM_WORKER_BULL_BOARD_PATH,
      queues: raw.IAM_WORKER_BULL_BOARD_QUEUES,
      authEnabled: raw.IAM_WORKER_BULL_BOARD_AUTH_ENABLED,
      username: raw.IAM_WORKER_BULL_BOARD_USERNAME ?? defaultDashboardUsername(raw),
      password: raw.IAM_WORKER_BULL_BOARD_PASSWORD ?? defaultDashboardPassword(raw),
      readOnly: raw.IAM_WORKER_BULL_BOARD_READ_ONLY,
    },
    userDocument: {
      concurrency: raw.IAM_WORKER_USER_DOCUMENT_CONCURRENCY,
      rebuildBatchSize: raw.IAM_WORKER_USER_DOCUMENT_REBUILD_BATCH_SIZE,
      repairStaleSeconds: raw.IAM_WORKER_USER_DOCUMENT_REPAIR_STALE_SECONDS,
      repair: {
        enabled: raw.IAM_WORKER_USER_DOCUMENT_REPAIR_ENABLED,
        intervalMs: raw.IAM_WORKER_USER_DOCUMENT_REPAIR_INTERVAL_MS,
        limit: raw.IAM_WORKER_USER_DOCUMENT_REPAIR_LIMIT,
        deadlineMs: raw.IAM_WORKER_USER_DOCUMENT_REPAIR_DEADLINE_MS,
      },
    },
    organizationDocument: {
      concurrency: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_CONCURRENCY,
      repairStaleSeconds: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_STALE_SECONDS,
      repair: {
        enabled: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_ENABLED,
        intervalMs: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_INTERVAL_MS,
        limit: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_LIMIT,
        deadlineMs: raw.IAM_WORKER_ORGANIZATION_DOCUMENT_REPAIR_DEADLINE_MS,
      },
    },
  };
}

function defaultDashboardUsername(raw: RawWorkerEnv) {
  return raw.NODE_ENV === "production" ? undefined : "iam-worker";
}

function defaultDashboardPassword(raw: RawWorkerEnv) {
  return raw.NODE_ENV === "production" ? undefined : "iam-worker-dev";
}

function exposeDatabaseUrlForDbPackage(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
}

export function parseWorkerEnv(source: NodeJS.ProcessEnv): WorkerEnv {
  requireDefaultOrganizationQueuePrefix(source);
  const env = toWorkerEnv(RawWorkerEnvSchema.parse(source));
  exposeDatabaseUrlForDbPackage(env.databaseUrl);
  return env;
}

function requireDefaultOrganizationQueuePrefix(source: NodeJS.ProcessEnv) {
  const prefix = source.IAM_WORKER_ORGANIZATION_DOCUMENT_QUEUE_PREFIX;
  if (prefix !== undefined && prefix !== DEFAULT_QUEUE_PREFIX)
    throw new RangeError(`Organization Search queue prefix is fixed to ${DEFAULT_QUEUE_PREFIX}`);
}

export default function loadWorkerEnv(): WorkerEnv {
  return parseWorkerEnv(process.env);
}

/** Private normalized input for one isolated repair child, created only by Worker composition. */
const DocumentRepairInvocationSchema = z.object({
  document: z.enum(["user", "organization"]),
  postgresInvocationId: z.uuid(),
  limit: z.number().int().positive(),
  deadlineMs: z.number().int().positive().max(300_000),
  env: z.object({
    nodeEnv: z.enum(["development", "test", "production"]),
    databaseUrl: z.string().min(1),
    redis: z.object({
      host: z.string().min(1),
      port: z.number().int().positive().max(65535),
      db: z.number().int().nonnegative(),
      username: z.string().optional(),
      password: z.string().optional(),
    }),
    log: z.object({ level: z.string(), format: z.enum(["auto", "json", "pretty"]) }),
    userDocument: z.object({
      rebuildBatchSize: z.number().int().positive(),
      repairStaleSeconds: z.number().int().positive(),
    }),
    organizationDocument: z.object({
      repairStaleSeconds: z.number().int().positive(),
    }),
  }),
});
export type DocumentRepairInvocation = z.infer<typeof DocumentRepairInvocationSchema>;
export function parseDocumentRepairInvocation(source: NodeJS.ProcessEnv): DocumentRepairInvocation {
  return DocumentRepairInvocationSchema.parse(JSON.parse(source.IAM_WORKER_DOCUMENT_REPAIR_INPUT ?? "null"));
}
