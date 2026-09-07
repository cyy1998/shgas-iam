import { z } from "zod";

const moduleKeySchema = z.string().trim().min(1);

export type WorkerModuleSelection = {
  mode: "all" | "none" | "list";
  keys: string[];
};

function booleanString(defaultValue: boolean) {
  return z.string().optional().transform((value) => {
    if (value === undefined || value.trim() === "")
      return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });
}

function optionalNonEmptyString() {
  return z.string().optional().transform(value => value?.trim() || undefined);
}

function slashPath(defaultValue: string) {
  return z.string().optional().transform((value, ctx) => {
    const path = value?.trim() || defaultValue;
    if (!path.startsWith("/")) {
      ctx.addIssue({ code: "custom", message: `${path} must start with /` });
      return z.NEVER;
    }
    return path.length > 1 ? path.replace(/\/+$/u, "") : path;
  });
}

function moduleSelection(defaultValue: "all" | "none" | string) {
  return z.string().optional().transform((value, ctx) => {
    const raw = value?.trim() || defaultValue;
    if (raw === "all" || raw === "none") {
      return { mode: raw, keys: [] } satisfies WorkerModuleSelection;
    }

    const keys = [...new Set(raw.split(",").map(item => item.trim()).filter(Boolean))];
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

const RawWorkerEnvSchema = z.object({
  IAM_WORKER_DATABASE_URL: z.string().min(1),
  IAM_WORKER_REDIS_HOST: z.string().min(1),
  IAM_WORKER_REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  IAM_WORKER_REDIS_PASSWORD: optionalNonEmptyString(),
  IAM_WORKER_REDIS_DB: z.coerce.number().int().min(0).default(0),
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
  IAM_WORKER_USER_PROFILE_CONCURRENCY: z.coerce.number().int().positive().default(2),
  IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS: z.coerce.number().int().positive().max(86_400).default(300),
}).superRefine((raw, ctx) => {
  if (!raw.IAM_WORKER_BULL_BOARD_ENABLED)
    return;

  if (raw.NODE_ENV === "production" && !raw.IAM_WORKER_BULL_BOARD_AUTH_ENABLED) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_WORKER_BULL_BOARD_AUTH_ENABLED"],
      message: "IAM_WORKER_BULL_BOARD_AUTH_ENABLED must be true when dashboard is enabled in production",
    });
  }

  if (
    raw.NODE_ENV === "production"
    && (raw.IAM_WORKER_BULL_BOARD_USERNAME === undefined || raw.IAM_WORKER_BULL_BOARD_PASSWORD === undefined)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_WORKER_BULL_BOARD_USERNAME"],
      message: "IAM_WORKER_BULL_BOARD_USERNAME and IAM_WORKER_BULL_BOARD_PASSWORD are required in production",
    });
  }
});

const EmploymentCommandEnvSchema = z.object({
  IAM_WORKER_DATABASE_URL: z.string().min(1),
  NODE_ENV: z.string().default("development"),
  IAM_WORKER_LOG_LEVEL: z.string().default("info"),
  IAM_WORKER_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
});

const AuditActionMaintenanceCommandEnvSchema = z.object({
  IAM_WORKER_DATABASE_URL: z.string().min(1),
});

const UserProfilePostgresReadinessCommandEnvSchema = z.object({
  IAM_WORKER_DATABASE_URL: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IAM_WORKER_LOG_LEVEL: z.string().default("info"),
  IAM_WORKER_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE: z.coerce.number().int().positive().default(500),
});

const ClientRuntimeMaintenanceCommandEnvSchema = z.object({
  IAM_WORKER_REDIS_HOST: z.string().min(1),
  IAM_WORKER_REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  IAM_WORKER_REDIS_PASSWORD: optionalNonEmptyString(),
  IAM_WORKER_REDIS_DB: z.coerce.number().int().min(0).default(0),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IAM_WORKER_LOG_LEVEL: z.string().default("info"),
  IAM_WORKER_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
});

type RawWorkerEnv = z.infer<typeof RawWorkerEnvSchema>;

export interface WorkerEnv {
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
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
  userProfile: {
    concurrency: number;
    rebuildBatchSize: number;
    backfillBatchSize: number;
    repairStaleSeconds: number;
  };
}

export interface EmploymentCommandEnv {
  databaseUrl: string;
  nodeEnv: string;
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
}

export interface UserProfilePostgresReadinessCommandEnv {
  databaseUrl: string;
  nodeEnv: "development" | "test" | "production";
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  userProfile: {
    rebuildBatchSize: number;
    backfillBatchSize: number;
  };
}

export interface ClientRuntimeMaintenanceCommandEnv {
  redis: WorkerEnv["redis"];
  nodeEnv: WorkerEnv["nodeEnv"];
  log: WorkerEnv["log"];
}

function toWorkerEnv(raw: RawWorkerEnv): WorkerEnv {
  return {
    databaseUrl: raw.IAM_WORKER_DATABASE_URL,
    redis: {
      host: raw.IAM_WORKER_REDIS_HOST,
      port: raw.IAM_WORKER_REDIS_PORT,
      password: raw.IAM_WORKER_REDIS_PASSWORD,
      db: raw.IAM_WORKER_REDIS_DB,
    },
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
    userProfile: {
      concurrency: raw.IAM_WORKER_USER_PROFILE_CONCURRENCY,
      rebuildBatchSize: raw.IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE,
      backfillBatchSize: raw.IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE,
      repairStaleSeconds: raw.IAM_WORKER_USER_PROFILE_REPAIR_STALE_SECONDS,
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
  const env = toWorkerEnv(RawWorkerEnvSchema.parse(source));
  exposeDatabaseUrlForDbPackage(env.databaseUrl);
  return env;
}

export function parseEmploymentCommandEnv(
  source: NodeJS.ProcessEnv,
): EmploymentCommandEnv {
  const raw = EmploymentCommandEnvSchema.parse(source);
  exposeDatabaseUrlForDbPackage(raw.IAM_WORKER_DATABASE_URL);
  return {
    databaseUrl: raw.IAM_WORKER_DATABASE_URL,
    nodeEnv: raw.NODE_ENV,
    log: {
      level: raw.IAM_WORKER_LOG_LEVEL,
      format: raw.IAM_WORKER_LOG_FORMAT,
    },
  };
}

export function parseAuditActionMaintenanceCommandEnv(source: NodeJS.ProcessEnv) {
  const raw = AuditActionMaintenanceCommandEnvSchema.parse(source);
  const databaseUrl = raw.IAM_WORKER_DATABASE_URL;
  if (!["postgres:", "postgresql:"].includes(new URL(databaseUrl).protocol))
    throw new Error("invalid database configuration");
  return { databaseUrl };
}

export function parseUserProfilePostgresReadinessCommandEnv(
  source: NodeJS.ProcessEnv,
): UserProfilePostgresReadinessCommandEnv {
  const raw = UserProfilePostgresReadinessCommandEnvSchema.parse(source);
  exposeDatabaseUrlForDbPackage(raw.IAM_WORKER_DATABASE_URL);
  return {
    databaseUrl: raw.IAM_WORKER_DATABASE_URL,
    nodeEnv: raw.NODE_ENV,
    log: {
      level: raw.IAM_WORKER_LOG_LEVEL,
      format: raw.IAM_WORKER_LOG_FORMAT,
    },
    userProfile: {
      rebuildBatchSize: raw.IAM_WORKER_USER_PROFILE_REBUILD_BATCH_SIZE,
      backfillBatchSize: raw.IAM_WORKER_USER_PROFILE_BACKFILL_BATCH_SIZE,
    },
  };
}

export function parseClientRuntimeMaintenanceCommandEnv(
  source: NodeJS.ProcessEnv,
): ClientRuntimeMaintenanceCommandEnv {
  const raw = ClientRuntimeMaintenanceCommandEnvSchema.parse(source);
  return {
    redis: {
      host: raw.IAM_WORKER_REDIS_HOST,
      port: raw.IAM_WORKER_REDIS_PORT,
      password: raw.IAM_WORKER_REDIS_PASSWORD,
      db: raw.IAM_WORKER_REDIS_DB,
    },
    nodeEnv: raw.NODE_ENV,
    log: {
      level: raw.IAM_WORKER_LOG_LEVEL,
      format: raw.IAM_WORKER_LOG_FORMAT,
    },
  };
}

export default function loadWorkerEnv(): WorkerEnv {
  return parseWorkerEnv(process.env);
}
