import type { LegacySessionCleanupRedis } from "../kernel";
import {
  cleanupLegacySessionKeys,
  parseLegacySessionCleanupArgs,
} from "@iam/api-core/session/kernel";
import { SystemLogEvent } from "@iam/api-core/logger";
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

describe("legacy session key cleanup tooling", () => {
  test("dry-run reports allowlisted pattern counts without deleting or logging keys", async () => {
    const redis = new FakeCleanupRedis([
      sensitiveGlobalKey,
      "auth_code:custom-code-123456789012345678901234567890",
      "local_iam-admin_session:local-session-12345678901234567890",
      "local_session_reverse:local-session-12345678901234567890",
      "local_session_set:principal-session-12345678901234567890",
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
    expect(result.patternCounts["oidc-model-payload"]).toBe(1);
    expect(result.patternCounts["oidc-client-token-index"]).toBe(1);
    expect(result.deletedCounts["global-session"]).toBe(0);
    expect(redis.keys.has(sensitiveGlobalKey)).toBe(true);
    expect(lines.join("\n")).toContain(SystemLogEvent.SessionKernelCleanupLegacyKeysCompleted);
    expect(lines.join("\n")).not.toContain(sensitiveGlobalKey);
    expect(lines.join("\n")).not.toContain(sensitiveOidcKey);
  });

  test("apply deletes only built-in allowlisted patterns", async () => {
    const redis = new FakeCleanupRedis([
      sensitiveGlobalKey,
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
    expect(result.deletedCounts["oidc-model-payload"]).toBe(1);
    expect(result.deletedCounts["oidc-provider-session-binding"]).toBe(1);
    expect(redis.keys.has(sensitiveGlobalKey)).toBe(false);
    expect(redis.keys.has(sensitiveOidcKey)).toBe(false);
    expect(redis.keys.has("cache:client:code:iam-admin")).toBe(true);
  });

  test("rejects arbitrary external cleanup patterns", () => {
    expect(parseLegacySessionCleanupArgs(["--apply", "--batch-size=100"])).toEqual({
      mode: "apply",
      batchSize: 100,
    });
    expect(() => parseLegacySessionCleanupArgs(["--apply", "--pattern", "cache:*"])).toThrow(
      "External cleanup patterns are not supported",
    );
    expect(() => parseLegacySessionCleanupArgs(["cache:*"])).toThrow(
      "External cleanup patterns are not supported",
    );
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
