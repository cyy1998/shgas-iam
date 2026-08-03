import { SystemLogEvent } from "../../logger";

export const LEGACY_SESSION_CLEANUP_SOURCE_APP = "iam-release-tooling";

export const CUSTOM_SSO_CUTOVER_KEY_CLEANUP_ALLOWLIST = [
  { id: "global-session", pattern: "global_session:*" },
  { id: "custom-sso-auth-code", pattern: "auth_code:*" },
  { id: "custom-sso-local-session", pattern: "local_*_session:*" },
  { id: "custom-sso-local-session-reverse", pattern: "local_session_reverse:*" },
  { id: "custom-sso-local-session-set", pattern: "local_session_set:*" },
  {
    id: "custom-sso-local-session-payload",
    pattern: "custom-sso:local-session-payload:*",
  },
] as const;

const OIDC_LEGACY_SESSION_KEY_CLEANUP_ALLOWLIST = [
  { id: "oidc-model-payload", pattern: "oidc:model:*" },
  { id: "oidc-consumed-payload", pattern: "oidc:consumed:*" },
  { id: "oidc-grant-index", pattern: "oidc:grant-objects:*" },
  { id: "oidc-client-object-index", pattern: "oidc:client-objects:*" },
  { id: "oidc-session-uid-index", pattern: "oidc:session-uid:*" },
  { id: "oidc-user-code-index", pattern: "oidc:user-code:*" },
  { id: "oidc-user-token-index", pattern: "oidc:user-tokens:*" },
  { id: "oidc-client-token-index", pattern: "oidc:client-tokens:*" },
  { id: "oidc-global-session-token-index", pattern: "oidc:global-session-tokens:*" },
  { id: "oidc-login-return-handle", pattern: "oidc:login-return:*" },
  { id: "oidc-provider-session-binding", pattern: "oidc:provider-session-binding:*" },
  { id: "oidc-provider-session-binding-lookup", pattern: "oidc:provider-session-binding-lookup:*" },
  { id: "oidc-pending-provider-session-binding", pattern: "oidc:pending-provider-session-binding:*" },
] as const;

export const LEGACY_SESSION_KEY_CLEANUP_ALLOWLIST = [
  ...CUSTOM_SSO_CUTOVER_KEY_CLEANUP_ALLOWLIST,
  ...OIDC_LEGACY_SESSION_KEY_CLEANUP_ALLOWLIST,
] as const;

export const LEGACY_SESSION_KEY_CLEANUP_PROFILES = {
  "all": LEGACY_SESSION_KEY_CLEANUP_ALLOWLIST,
  "custom-sso-cutover": CUSTOM_SSO_CUTOVER_KEY_CLEANUP_ALLOWLIST,
} as const;

export type LegacySessionCleanupMode = "dry-run" | "verify" | "apply";
export type LegacySessionCleanupProfile = keyof typeof LEGACY_SESSION_KEY_CLEANUP_PROFILES;
export type LegacySessionCleanupPattern = typeof LEGACY_SESSION_KEY_CLEANUP_ALLOWLIST[number];
export type LegacySessionCleanupPatternId = LegacySessionCleanupPattern["id"];

export interface LegacySessionCleanupRedis {
  scan: (
    cursor: string,
    matchKeyword: "MATCH",
    pattern: string,
    countKeyword: "COUNT",
    count: number,
  ) => Promise<[string, string[]]>;
  del: (...keys: string[]) => Promise<number>;
  unlink?: (...keys: string[]) => Promise<number>;
}

export interface LegacySessionCleanupLogger {
  info?: (data: Record<string, unknown>, message?: string) => void;
  warn?: (data: Record<string, unknown>, message?: string) => void;
  error?: (data: Record<string, unknown>, message?: string) => void;
}

export type LegacySessionCleanupOptions = {
  mode: LegacySessionCleanupMode;
  profile?: LegacySessionCleanupProfile;
  batchSize?: number;
  sourceApp?: string;
  now?: () => number;
  logger?: LegacySessionCleanupLogger;
};

export type LegacySessionCleanupPatternSummary = {
  id: LegacySessionCleanupPatternId;
  pattern: string;
  matched: number;
  deleted: number;
};

export type LegacySessionCleanupCompletedResult = {
  result: "completed";
  sourceApp: string;
  mode: LegacySessionCleanupMode;
  profile: LegacySessionCleanupProfile;
  batchSize: number;
  durationMs: number;
  patternCounts: Partial<Record<LegacySessionCleanupPatternId, number>>;
  deletedCounts: Partial<Record<LegacySessionCleanupPatternId, number>>;
  patterns: LegacySessionCleanupPatternSummary[];
};

export type LegacySessionCleanupFailedResult = Omit<LegacySessionCleanupCompletedResult, "result"> & {
  result: "failed";
  failedPattern: LegacySessionCleanupPatternId;
  errorName: string;
  errorMessage: string;
};

export type LegacySessionCleanupResult
  = | LegacySessionCleanupCompletedResult
    | LegacySessionCleanupFailedResult;

export type LegacySessionCleanupCliOptions = {
  mode: LegacySessionCleanupMode;
  profile: LegacySessionCleanupProfile;
  batchSize: number;
};

const DEFAULT_BATCH_SIZE = 500;

export function parseLegacySessionCleanupArgs(args: string[]): LegacySessionCleanupCliOptions {
  let mode: LegacySessionCleanupMode | undefined;
  let batchSize = DEFAULT_BATCH_SIZE;
  let profile: LegacySessionCleanupProfile = "all";
  let profileSpecified = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined)
      continue;
    if (arg === "--dry-run" || arg === "--verify") {
      const requestedMode = arg === "--verify" ? "verify" : "dry-run";
      if (mode && mode !== requestedMode)
        throw new Error("Use only one of --dry-run, --verify, or --apply");
      mode = requestedMode;
      continue;
    }
    if (arg === "--apply") {
      if (mode && mode !== "apply")
        throw new Error("Use only one of --dry-run, --verify, or --apply");
      mode = "apply";
      continue;
    }
    if (arg === "--batch-size") {
      const value = args[index + 1];
      if (!value)
        throw new Error("--batch-size requires a positive integer value");
      batchSize = parseBatchSize(value);
      index += 1;
      continue;
    }
    if (arg === "--profile") {
      if (profileSpecified)
        throw new Error("Specify --profile only once");
      const value = args[index + 1];
      if (!value)
        throw new Error("--profile requires a built-in cleanup profile");
      profileSpecified = true;
      profile = parseCleanupProfile(value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--profile=")) {
      if (profileSpecified)
        throw new Error("Specify --profile only once");
      profileSpecified = true;
      profile = parseCleanupProfile(arg.slice("--profile=".length));
      continue;
    }
    if (arg.startsWith("--batch-size=")) {
      batchSize = parseBatchSize(arg.slice("--batch-size=".length));
      continue;
    }
    if (arg === "--pattern" || arg.startsWith("--pattern=") || !arg.startsWith("--")) {
      throw new Error("External cleanup patterns are not supported; use the built-in allowlist only");
    }
    throw new Error(`Unsupported argument: ${arg}`);
  }

  return { mode: mode ?? "dry-run", batchSize, profile };
}

export async function cleanupLegacySessionKeys(
  redis: LegacySessionCleanupRedis,
  options: LegacySessionCleanupOptions,
): Promise<LegacySessionCleanupResult> {
  const batchSize = normalizeBatchSize(options.batchSize);
  const sourceApp = options.sourceApp ?? LEGACY_SESSION_CLEANUP_SOURCE_APP;
  const profile = options.profile ?? "all";
  const allowlist = LEGACY_SESSION_KEY_CLEANUP_PROFILES[profile];
  const now = options.now ?? Date.now;
  const startedAt = now();
  const summaries: LegacySessionCleanupPatternSummary[] = [];

  try {
    for (const allowlistedPattern of allowlist) {
      summaries.push(await cleanupPattern(redis, allowlistedPattern, options.mode, batchSize));
    }

    if (options.mode === "verify") {
      const residual = summaries.find(summary => summary.matched > 0);
      if (residual !== undefined) {
        const error = new Error("legacy keys remain for the selected cleanup profile");
        error.name = "LegacySessionCleanupVerificationError";
        throw attachFailedPattern(error, residual.id);
      }
    }

    const result = buildResult(
      "completed",
      sourceApp,
      options.mode,
      profile,
      batchSize,
      now() - startedAt,
      allowlist,
      summaries,
    );
    options.logger?.info?.({
      event: SystemLogEvent.SessionKernelCleanupLegacyKeysCompleted,
      sourceApp,
      mode: result.mode,
      profile: result.profile,
      patternCounts: result.patternCounts,
      deletedCounts: result.deletedCounts,
      durationMs: result.durationMs,
      result: result.result,
    }, "session kernel legacy key cleanup completed");
    return result;
  }
  catch (error) {
    const failedPattern = readFailedPattern(error, allowlist);
    const result = {
      ...buildResult(
        "failed",
        sourceApp,
        options.mode,
        profile,
        batchSize,
        now() - startedAt,
        allowlist,
        summaries,
      ),
      failedPattern,
      errorName: error instanceof Error ? error.name : "Error",
      errorMessage: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
    } satisfies LegacySessionCleanupFailedResult;
    options.logger?.warn?.({
      event: SystemLogEvent.SessionKernelCleanupLegacyKeysFailed,
      sourceApp,
      mode: result.mode,
      profile: result.profile,
      failedPattern: result.failedPattern,
      errorName: result.errorName,
      errorMessage: result.errorMessage,
      patternCounts: result.patternCounts,
      deletedCounts: result.deletedCounts,
      durationMs: result.durationMs,
      result: result.result,
    }, "session kernel legacy key cleanup failed");
    return result;
  }
}

async function cleanupPattern(
  redis: LegacySessionCleanupRedis,
  allowlistedPattern: LegacySessionCleanupPattern,
  mode: LegacySessionCleanupMode,
  batchSize: number,
): Promise<LegacySessionCleanupPatternSummary> {
  let cursor = "0";
  let matched = 0;
  let deleted = 0;

  try {
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", allowlistedPattern.pattern, "COUNT", batchSize);
      cursor = nextCursor;
      matched += keys.length;
      if (mode === "apply" && keys.length > 0)
        deleted += await deleteKeys(redis, keys);
    } while (cursor !== "0");
  }
  catch (error) {
    throw attachFailedPattern(error, allowlistedPattern.id);
  }

  return {
    id: allowlistedPattern.id,
    pattern: allowlistedPattern.pattern,
    matched,
    deleted,
  };
}

async function deleteKeys(redis: LegacySessionCleanupRedis, keys: string[]) {
  const deleteCommand = redis.unlink ?? redis.del;
  return await deleteCommand.call(redis, ...keys);
}

function buildResult<TStatus extends LegacySessionCleanupResult["result"]>(
  result: TStatus,
  sourceApp: string,
  mode: LegacySessionCleanupMode,
  profile: LegacySessionCleanupProfile,
  batchSize: number,
  durationMs: number,
  allowlist: readonly LegacySessionCleanupPattern[],
  summaries: LegacySessionCleanupPatternSummary[],
) {
  const patternCounts = Object.fromEntries(
    allowlist.map(({ id }) => [id, 0]),
  ) as Partial<Record<LegacySessionCleanupPatternId, number>>;
  const deletedCounts = { ...patternCounts };
  for (const summary of summaries) {
    patternCounts[summary.id] = summary.matched;
    deletedCounts[summary.id] = summary.deleted;
  }

  return {
    result,
    sourceApp,
    mode,
    profile,
    batchSize,
    durationMs: Math.max(0, durationMs),
    patternCounts,
    deletedCounts,
    patterns: summaries,
  };
}

function normalizeBatchSize(batchSize: number | undefined) {
  return parseBatchSize(String(batchSize ?? DEFAULT_BATCH_SIZE));
}

function parseBatchSize(value: string) {
  const batchSize = Number(value);
  if (!Number.isInteger(batchSize) || batchSize <= 0)
    throw new Error("batch size must be a positive integer");
  return batchSize;
}

const failedPatternSymbol = Symbol("failedPattern");

function attachFailedPattern(error: unknown, pattern: LegacySessionCleanupPatternId) {
  if (error && (typeof error === "object" || typeof error === "function"))
    Object.assign(error, { [failedPatternSymbol]: pattern });
  return error;
}

function readFailedPattern(
  error: unknown,
  allowlist: readonly LegacySessionCleanupPattern[],
): LegacySessionCleanupPatternId {
  if (error && (typeof error === "object" || typeof error === "function")) {
    const value = (error as { [failedPatternSymbol]?: unknown })[failedPatternSymbol];
    if (typeof value === "string" && allowlist.some(pattern => pattern.id === value))
      return value as LegacySessionCleanupPatternId;
  }
  const fallback = allowlist[0];
  if (fallback === undefined)
    throw new Error("Built-in cleanup profiles must contain at least one pattern");
  return fallback.id;
}

function parseCleanupProfile(value: string): LegacySessionCleanupProfile {
  if (value === "all" || value === "custom-sso-cutover")
    return value;
  throw new Error("Unsupported cleanup profile");
}

function sanitizeErrorMessage(message: string) {
  return message
    .replace(/redis:\/\/\S+/giu, "redis://[REDACTED]")
    .replace(/\b(?:global_session|auth_code|local_[^\s:]+_session|local_session_reverse|local_session_set|oidc:[^\s:]+):\S+/giu, "[REDACTED_KEY]")
    .replace(/[\w-]{32,}/gu, "[REDACTED_VALUE]");
}
