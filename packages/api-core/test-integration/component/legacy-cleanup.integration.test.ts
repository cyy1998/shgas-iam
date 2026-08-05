import type { LegacySessionCleanupRedis } from "../../src/session/kernel";
import { SystemLogEvent } from "@iam/api-core/logger";
import {
  cleanupLegacySessionKeys,
  parseLegacySessionCleanupArgs,
} from "@iam/api-core/session/kernel";
import { describe, expect, test } from "bun:test";

class FakeCleanupRedis implements LegacySessionCleanupRedis {
  readonly keys = new Set<string>();
  throwOnPattern?: string;

  constructor(keys: string[]) {
    for (const key of keys)
      this.keys.add(key);
  }

  async scan(
    cursor: string,
    _matchKeyword: "MATCH",
    pattern: string,
    _countKeyword: "COUNT",
    count: number,
  ): Promise<[string, string[]]> {
    if (pattern === this.throwOnPattern)
      throw new Error(`scan failed for global_session:token-like-secret-12345678901234567890`);
    const offset = Number(cursor);
    const matched = [...this.keys].filter(key => globMatch(pattern, key)).sort();
    const page = matched.slice(offset, offset + count);
    const nextOffset = offset + page.length;
    return [nextOffset >= matched.length ? "0" : String(nextOffset), page];
  }

  async del(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      if (this.keys.delete(key))
        deleted += 1;
    }
    return deleted;
  }
}

function createLogger() {
  const lines: string[] = [];
  return {
    lines,
    logger: {
      info(data: Record<string, unknown>) {
        lines.push(JSON.stringify(data));
      },
      warn(data: Record<string, unknown>) {
        lines.push(JSON.stringify(data));
      },
    },
  };
}

const sensitiveGlobalKey = "global_session:principal-token-123456789012345678901234567890";
const sensitiveOidcKey = "oidc:model:AccessToken:opaque-access-token-12345678901234567890";
const sensitiveCustomSsoPayloadKey
  = "custom-sso:local-session-payload:opaque-payload-ref-12345678901234567890";

describe("legacy session key cleanup tooling", () => {
  test("dry-run reports allowlisted pattern counts without deleting or logging keys", async () => {
    const redis = new FakeCleanupRedis([
      sensitiveGlobalKey,
      "auth_code:custom-code-123456789012345678901234567890",
      "local_iam-admin_session:local-session-12345678901234567890",
      "local_session_reverse:local-session-12345678901234567890",
      "local_session_set:principal-session-12345678901234567890",
      sensitiveCustomSsoPayloadKey,
      sensitiveOidcKey,
      "oidc:client-tokens:iam-admin",
      "cache:client:code:iam-admin",
    ]);
    const { logger, lines } = createLogger();

    const result = await cleanupLegacySessionKeys(redis, {
      mode: "dry-run",
      logger,
      now: () => 1_000,
    });

    expect(result.result).toBe("completed");
    expect(result.patternCounts["global-session"]).toBe(1);
    expect(result.patternCounts["custom-sso-local-session-payload"]).toBe(1);
    expect(result.patternCounts["oidc-model-payload"]).toBe(1);
    expect(result.patternCounts["oidc-client-token-index"]).toBe(1);
    expect(result.deletedCounts["global-session"]).toBe(0);
    expect(redis.keys.has(sensitiveGlobalKey)).toBe(true);
    expect(lines.join("\n")).toContain(SystemLogEvent.SessionKernelCleanupLegacyKeysCompleted);
    expect(lines.join("\n")).not.toContain(sensitiveGlobalKey);
    expect(lines.join("\n")).not.toContain(sensitiveCustomSsoPayloadKey);
    expect(lines.join("\n")).not.toContain(sensitiveOidcKey);
  });

  test("verify blocks the cutover while legacy Custom SSO artifacts remain", async () => {
    const redis = new FakeCleanupRedis([
      sensitiveGlobalKey,
      sensitiveCustomSsoPayloadKey,
      sensitiveOidcKey,
    ]);
    const { logger, lines } = createLogger();

    const blocked = await cleanupLegacySessionKeys(redis, {
      mode: "verify",
      profile: "custom-sso-cutover",
      logger,
      now: () => 1_000,
    });

    expect(blocked).toMatchObject({
      result: "failed",
      mode: "verify",
      profile: "custom-sso-cutover",
      failedPattern: "global-session",
      errorName: "LegacySessionCleanupVerificationError",
      errorMessage: "legacy keys remain for the selected cleanup profile",
      patternCounts: {
        "global-session": 1,
        "custom-sso-local-session-payload": 1,
      },
    });
    expect(redis.keys.has(sensitiveGlobalKey)).toBe(true);
    expect(redis.keys.has(sensitiveCustomSsoPayloadKey)).toBe(true);
    expect(redis.keys.has(sensitiveOidcKey)).toBe(true);
    expect(lines.join("\n")).not.toContain(sensitiveGlobalKey);
    expect(lines.join("\n")).not.toContain(sensitiveCustomSsoPayloadKey);

    await cleanupLegacySessionKeys(redis, {
      mode: "apply",
      profile: "custom-sso-cutover",
      now: () => 1_000,
    });
    await expect(cleanupLegacySessionKeys(redis, {
      mode: "verify",
      profile: "custom-sso-cutover",
      now: () => 1_000,
    })).resolves.toMatchObject({
      result: "completed",
      mode: "verify",
      profile: "custom-sso-cutover",
      patternCounts: {
        "global-session": 0,
        "custom-sso-local-session-payload": 0,
      },
    });
    expect(redis.keys.has(sensitiveOidcKey)).toBe(true);
  });

  test("apply deletes only built-in allowlisted patterns", async () => {
    const redis = new FakeCleanupRedis([
      sensitiveGlobalKey,
      sensitiveCustomSsoPayloadKey,
      sensitiveOidcKey,
      "oidc:provider-session-binding:uid-1",
      "cache:client:code:iam-admin",
    ]);

    const result = await cleanupLegacySessionKeys(redis, {
      mode: "apply",
      batchSize: 2,
      now: () => 1_000,
    });

    expect(result.result).toBe("completed");
    expect(result.deletedCounts["global-session"]).toBe(1);
    expect(result.deletedCounts["custom-sso-local-session-payload"]).toBe(1);
    expect(result.deletedCounts["oidc-model-payload"]).toBe(1);
    expect(result.deletedCounts["oidc-provider-session-binding"]).toBe(1);
    expect(redis.keys.has(sensitiveCustomSsoPayloadKey)).toBe(false);
    expect(redis.keys.has(sensitiveGlobalKey)).toBe(false);
    expect(redis.keys.has(sensitiveOidcKey)).toBe(false);
    expect(redis.keys.has("cache:client:code:iam-admin")).toBe(true);
  });

  test("custom-sso-cutover deletes only old Principal and Custom SSO keys", async () => {
    const customSsoKeys = [
      sensitiveGlobalKey,
      "auth_code:custom-code-123456789012345678901234567890",
      "local_iam-admin_session:local-session-12345678901234567890",
      "local_session_reverse:local-session-12345678901234567890",
      "local_session_set:principal-session-12345678901234567890",
      sensitiveCustomSsoPayloadKey,
    ];
    const currentOidcKeys = [
      sensitiveOidcKey,
      "oidc:provider-session-binding:current-provider-session",
      "oidc:global-session-tokens:current-principal-session",
    ];
    const redis = new FakeCleanupRedis([
      ...customSsoKeys,
      ...currentOidcKeys,
      "cache:client:code:iam-admin",
    ]);

    const result = await cleanupLegacySessionKeys(redis, {
      mode: "apply",
      profile: "custom-sso-cutover",
      now: () => 1_000,
    });

    expect(result.result).toBe("completed");
    expect(result.profile).toBe("custom-sso-cutover");
    expect(result.patterns.map(pattern => pattern.pattern)).toEqual([
      "global_session:*",
      "auth_code:*",
      "local_*_session:*",
      "local_session_reverse:*",
      "local_session_set:*",
      "custom-sso:local-session-payload:*",
    ]);
    expect(result.patternCounts["oidc-model-payload"]).toBeUndefined();
    for (const key of customSsoKeys)
      expect(redis.keys.has(key)).toBe(false);
    for (const key of currentOidcKeys)
      expect(redis.keys.has(key)).toBe(true);
    expect(redis.keys.has("cache:client:code:iam-admin")).toBe(true);
  });

  test("rejects arbitrary external cleanup patterns", () => {
    expect(parseLegacySessionCleanupArgs(["--apply", "--batch-size=100"])).toEqual({
      mode: "apply",
      batchSize: 100,
      profile: "all",
    });
    expect(parseLegacySessionCleanupArgs([
      "--profile",
      "custom-sso-cutover",
      "--apply",
    ])).toEqual({
      mode: "apply",
      batchSize: 500,
      profile: "custom-sso-cutover",
    });
    expect(parseLegacySessionCleanupArgs([
      "--profile=custom-sso-cutover",
      "--verify",
    ])).toEqual({
      mode: "verify",
      batchSize: 500,
      profile: "custom-sso-cutover",
    });
    expect(() => parseLegacySessionCleanupArgs(["--apply", "--pattern", "cache:*"])).toThrow(
      "External cleanup patterns are not supported",
    );
    expect(() => parseLegacySessionCleanupArgs(["cache:*"])).toThrow(
      "External cleanup patterns are not supported",
    );
    expect(() => parseLegacySessionCleanupArgs([
      "--profile",
      "operator-supplied",
    ])).toThrow("Unsupported cleanup profile");
  });

  test.each([
    [
      "dedicated script conflict",
      [
        "--profile",
        "custom-sso-cutover",
        "--batch-size",
        "2",
        "--profile",
        "all",
        "--apply",
      ],
    ],
    [
      "same separated value",
      ["--profile", "custom-sso-cutover", "--profile", "custom-sso-cutover"],
    ],
    [
      "separated then equals",
      ["--profile", "custom-sso-cutover", "--profile=all"],
    ],
    [
      "equals then separated",
      ["--profile=custom-sso-cutover", "--profile", "all"],
    ],
    [
      "same equals value",
      ["--profile=custom-sso-cutover", "--profile=custom-sso-cutover"],
    ],
  ])("rejects repeated cleanup profiles: %s", (_label, args) => {
    expect(() => parseLegacySessionCleanupArgs(args)).toThrow(
      "Specify --profile only once",
    );
  });

  test("does not echo a trailing profile value when rejecting an override", () => {
    const sensitiveValue = "operator-secret-profile-value";
    let error: unknown;
    try {
      parseLegacySessionCleanupArgs([
        "--profile",
        "custom-sso-cutover",
        `--profile=${sensitiveValue}`,
      ]);
    }
    catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Specify --profile only once");
    expect((error as Error).message).not.toContain(sensitiveValue);
  });

  test("does not echo an unsupported cleanup profile", () => {
    const sensitiveValue = "operator-secret-unsupported-profile";
    let error: unknown;
    try {
      parseLegacySessionCleanupArgs(["--profile", sensitiveValue]);
    }
    catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Unsupported cleanup profile");
    expect((error as Error).message).not.toContain(sensitiveValue);
  });

  test("returns a failed summary without logging full keys or token-like values", async () => {
    const redis = new FakeCleanupRedis([sensitiveGlobalKey]);
    redis.throwOnPattern = "global_session:*";
    const { logger, lines } = createLogger();

    const result = await cleanupLegacySessionKeys(redis, {
      mode: "apply",
      logger,
      now: () => 1_000,
    });

    expect(result.result).toBe("failed");
    if (result.result !== "failed")
      throw new Error("expected cleanup to fail");
    expect(result.failedPattern).toBe("global-session");
    const output = lines.join("\n");
    expect(output).toContain(SystemLogEvent.SessionKernelCleanupLegacyKeysFailed);
    expect(output).not.toContain(sensitiveGlobalKey);
    expect(output).not.toContain("global_session:token-like-secret-12345678901234567890");
    expect(output).toContain("[REDACTED_KEY]");
  });
});

function globMatch(pattern: string, value: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "u").test(value);
}
