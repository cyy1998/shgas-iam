import type { SessionKernelRedis, SessionKernelRedisTransaction } from "@iam/api-core/session/kernel";
import { LoggerSourceApp, SystemLogEvent } from "@iam/api-core/logger";
import {
  createSessionKernel,
  createSessionKernelConfig,
} from "@iam/api-core/session/kernel";
import { describe, expect, it } from "vitest";
import {
  createOidcSessionKernelCleanupAdapter,
  OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
  OIDC_SESSION_PROTOCOL,
} from "../session/oidc-session-kernel.adapter.ts";

type RedisResult = [Error | null, unknown];

class KernelRedis implements SessionKernelRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly expiresAt = new Map<string, number>();
  now = 1_700_000_000_000;

  async get(key: string) {
    this.purgeExpired(key);
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.values.set(key, value);
    return "OK";
  }

  async del(...keys: string[]) {
    if (keys.some(key => key.includes("opaque-access-token")))
      throw new Error(`delete failed for ${keys.join(",")}`);
    let deleted = 0;
    for (const key of keys) {
      const didDelete = this.values.delete(key) || this.zsets.delete(key);
      this.expiresAt.delete(key);
      if (didDelete)
        deleted += 1;
    }
    return deleted;
  }

  async pexpireat(key: string, expiresAt: number) {
    if (!this.values.has(key) && !this.zsets.has(key))
      return 0;
    this.expiresAt.set(key, expiresAt);
    return 1;
  }

  async zadd(key: string, score: number, member: string) {
    const set = this.zsets.get(key) ?? new Map<string, number>();
    set.set(member, score);
    this.zsets.set(key, set);
    return 1;
  }

  async zrange(key: string, start: number, stop: number) {
    this.purgeExpired(key);
    const sorted = [...(this.zsets.get(key)?.entries() ?? [])]
      .sort((left, right) => left[1] - right[1])
      .map(([member]) => member);
    const normalizedStop = stop < 0 ? sorted.length + stop : stop;
    return sorted.slice(start, normalizedStop + 1);
  }

  async zrem(key: string, member: string) {
    return this.zsets.get(key)?.delete(member) ? 1 : 0;
  }

  async zremrangebyscore(key: string, min: string | number, max: string | number) {
    const set = this.zsets.get(key);
    if (!set)
      return 0;
    const lower = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    let removed = 0;
    for (const [member, score] of set) {
      if (score >= lower && score <= upper) {
        set.delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  multi() {
    const operations: Array<() => Promise<unknown> | unknown> = [];
    const transaction: SessionKernelRedisTransaction = {
      set: (key, value) => {
        operations.push(() => this.set(key, value));
        return transaction;
      },
      pexpireat: (key, expiresAt) => {
        operations.push(() => this.pexpireat(key, expiresAt));
        return transaction;
      },
      del: (...keys) => {
        operations.push(() => this.deleteWithoutFailure(...keys));
        return transaction;
      },
      zadd: (key, score, member) => {
        operations.push(() => this.zadd(key, score, member));
        return transaction;
      },
      zrem: (key, member) => {
        operations.push(() => this.zrem(key, member));
        return transaction;
      },
      exec: async () => await Promise.all(operations.map(async (operation): Promise<RedisResult> => {
        try {
          return [null, await operation()];
        }
        catch (error) {
          return [error instanceof Error ? error : new Error(String(error)), null];
        }
      })),
    };
    return transaction;
  }

  private async deleteWithoutFailure(...keys: string[]) {
    let deleted = 0;
    for (const key of keys) {
      const didDelete = this.values.delete(key) || this.zsets.delete(key);
      this.expiresAt.delete(key);
      if (didDelete)
        deleted += 1;
    }
    return deleted;
  }

  private purgeExpired(key: string) {
    if ((this.expiresAt.get(key) ?? Number.POSITIVE_INFINITY) > this.now)
      return;
    this.values.delete(key);
    this.zsets.delete(key);
    this.expiresAt.delete(key);
  }
}

function createKernelFixture() {
  const redis = new KernelRedis();
  const logs: Array<{ data: Record<string, unknown>; message: string }> = [];
  const logger = {
    warn(data: Record<string, unknown>, message: string) {
      logs.push({ data, message });
    },
  };
  const kernel = createSessionKernel({
    redis,
    config: createSessionKernelConfig({
      principalIdleTtlMs: 60_000,
      principalAbsoluteTtlMs: 300_000,
      tombstoneTtlMs: 60_000,
      tombstoneGraceMs: 5_000,
      lookupHmacKeys: {
        current: { id: "current", secret: "c".repeat(32) },
      },
      clock: { now: () => redis.now },
    }),
    cleanupAdapters: createOidcSessionKernelCleanupAdapter({ redis }),
    logger,
    sourceApp: LoggerSourceApp.OidcProvider,
  });
  return { kernel, logs };
}

describe("oidc Session Kernel release logging", () => {
  it("logs authorization code replay without leaking code, token, verifier, secret, or cookie values", async () => {
    const { kernel, logs } = createKernelFixture();
    const session = await kernel.createPrincipalSession({
      principal: { principalType: "user", subjectId: "7" },
      snapshot: { subjectId: "7", username: "alice", displayName: "Alice" },
    });
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const code = "oidc-authorization-code-secret-12345678901234567890";
    const artifact = await kernel.createProtocolArtifact({
      principalSessionId: session.value.principalSessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: "public-client",
      artifactType: "authorization_code",
      ttlMs: 60_000,
      externalToken: code,
    });
    expect(artifact.status).toBe("created");
    await kernel.consumeProtocolArtifact(code);
    logs.length = 0;

    await expect(kernel.consumeProtocolArtifact(code)).resolves.toMatchObject({ status: "consumed_replay" });

    const output = JSON.stringify(logs);
    expect(output).toContain(SystemLogEvent.SessionKernelTombstoneReplayDetected);
    expect(output).toContain(LoggerSourceApp.OidcProvider);
    expect(output).toContain("authorization_code");
    expect(output).not.toContain(code);
    expect(output).not.toContain("pkce-verifier-secret");
    expect(output).not.toContain("clientSecret");
    expect(output).not.toContain("Cookie");
  });

  it("logs OIDC cleanup failure summaries without private payload refs", async () => {
    const { kernel, logs } = createKernelFixture();
    const session = await kernel.createPrincipalSession({
      principal: { principalType: "user", subjectId: "7" },
      snapshot: { subjectId: "7", username: "alice", displayName: "Alice" },
    });
    expect(session.status).toBe("created");
    if (session.status !== "created")
      return;

    const tokenRef = "oidc:model:AccessToken:opaque-access-token-12345678901234567890";
    const credential = await kernel.issueCredential({
      principalSessionId: session.value.principalSessionId,
      protocol: OIDC_SESSION_PROTOCOL,
      clientCode: "public-client",
      credentialType: "access_token",
      ttlMs: 60_000,
      externalToken: "provider-token-secret-12345678901234567890",
      cleanupRefs: [{
        protocol: OIDC_SESSION_PROTOCOL,
        kind: OIDC_PROVIDER_TOKEN_PAYLOAD_CLEANUP_KIND,
        ref: tokenRef,
      }],
    });
    expect(credential.status).toBe("created");
    if (credential.status !== "created")
      return;

    await kernel.revokeCredential(credential.value.credentialId, "admin_revoke");

    const output = JSON.stringify(logs);
    expect(output).toContain(SystemLogEvent.SessionKernelRevokeCleanupFailed);
    expect(output).toContain(LoggerSourceApp.OidcProvider);
    expect(output).toContain("public-client");
    expect(output).not.toContain(tokenRef);
    expect(output).not.toContain("provider-token-secret-12345678901234567890");
    expect(output).not.toContain("clientSecret");
    expect(output).not.toContain("Cookie");
  });
});
