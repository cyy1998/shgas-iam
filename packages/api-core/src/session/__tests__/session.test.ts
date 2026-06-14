import type { Redis } from "ioredis";
import { GLOBAL_SESSION_VERSION } from "@iam/contracts";
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  createGlobalSession,
  globalSessionKey,
  localSessionKey,
  localSessionReverseKey,
  localSessionSetKey,
  readGlobalSession,
  removeGlobalSession,
  renewGlobalSession,
  replaceGlobalSessionUser,
  writeGlobalSession,
  writeLocalSession,
} from "../index";

type RedisResult = [Error | null, unknown];

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Array<{ member: string; score: number }>>();
  readonly expires = new Map<string, number>();
  now = 0;

  advance(milliseconds: number) {
    this.now += milliseconds;
  }

  async set(key: string, value: string, mode?: string, seconds?: number) {
    this.values.set(key, value);
    if (mode === "EX" && seconds !== undefined)
      this.expires.set(key, this.now + seconds * 1000);
    return "OK";
  }

  async get(key: string) {
    return await this.exists(key) > 0 ? this.values.get(key) ?? null : null;
  }

  async del(key: string) {
    const deleted = this.values.delete(key) || this.zsets.delete(key);
    this.expires.delete(key);
    return deleted ? 1 : 0;
  }

  async exists(key: string) {
    if ((this.expires.get(key) ?? Number.POSITIVE_INFINITY) <= this.now) {
      await this.del(key);
      return 0;
    }
    return this.values.has(key) || this.zsets.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    if (await this.exists(key) === 0)
      return -2;
    const expiresAt = this.expires.get(key);
    return expiresAt === undefined ? -1 : Math.ceil((expiresAt - this.now) / 1000);
  }

  async expire(key: string, seconds: number) {
    if (await this.exists(key) === 0)
      return 0;
    this.expires.set(key, this.now + seconds * 1000);
    return 1;
  }

  async zrange(key: string) {
    return (this.zsets.get(key) ?? []).map(item => item.member);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const lower = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const upper = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    const previous = this.zsets.get(key) ?? [];
    const next = previous.filter(item => item.score < lower || item.score > upper);
    this.zsets.set(key, next);
    return previous.length - next.length;
  }

  async zrem(key: string, member: string) {
    const previous = this.zsets.get(key) ?? [];
    const next = previous.filter(item => item.member !== member);
    this.zsets.set(key, next);
    return previous.length - next.length;
  }

  multi() {
    const operations: Array<() => Promise<unknown> | unknown> = [];
    const pipeline = {
      set: (key: string, value: string, mode?: string, seconds?: number) => {
        operations.push(() => this.set(key, value, mode, seconds));
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        operations.push(() => this.expire(key, seconds));
        return pipeline;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => {
          const previous = this.zsets.get(key) ?? [];
          this.zsets.set(key, [...previous.filter(item => item.member !== member), { member, score }]);
          return 1;
        });
        return pipeline;
      },
      zrem: (key: string, member: string) => {
        operations.push(() => this.zrem(key, member));
        return pipeline;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return pipeline;
      },
      exec: async () => await Promise.all(
        operations.map(async operation => [null, await operation()] as RedisResult),
      ),
    };
    return pipeline;
  }
}

const userSchema = z.object({ id: z.number(), username: z.string() });
const referenceSchema = z.object({
  clientCode: z.string(),
  localSessionId: z.string(),
  mode: z.string(),
});

describe("global session envelope", () => {
  test("creates and reads a versioned envelope with Unix authTime", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    const { sessionId, envelope } = await createGlobalSession(redis, { id: 1, username: "alice" }, 60);

    expect(envelope.version).toBe(GLOBAL_SESSION_VERSION);
    expect(Number.isInteger(envelope.authTime)).toBe(true);
    await expect(readGlobalSession(redis, sessionId, userSchema)).resolves.toEqual(envelope);
  });

  test("replaces user data without changing authTime", async () => {
    const redis = new FakeRedis() as unknown as Redis;
    await writeGlobalSession(redis, "session", {
      version: GLOBAL_SESSION_VERSION,
      authTime: 123,
      user: { id: 1, username: "alice" },
    }, 60);

    await expect(replaceGlobalSessionUser(
      redis,
      "session",
      { id: 1, username: "alice-updated" },
      userSchema,
      120,
    )).resolves.toBe(true);
    await expect(readGlobalSession(redis, "session", userSchema)).resolves.toMatchObject({
      authTime: 123,
      user: { username: "alice-updated" },
    });
  });

  test("rejects and deletes legacy unversioned session values", async () => {
    const fakeRedis = new FakeRedis();
    const redis = fakeRedis as unknown as Redis;
    await fakeRedis.set(globalSessionKey("legacy"), JSON.stringify({ id: 1, username: "alice" }), "EX", 60);

    await expect(readGlobalSession(redis, "legacy", userSchema)).resolves.toBeNull();
    expect(await fakeRedis.get(globalSessionKey("legacy"))).toBeNull();
  });
});

describe("global session lifecycle", () => {
  test("renews global, local, reverse, and set TTL without changing authTime", async () => {
    const fakeRedis = new FakeRedis();
    const redis = fakeRedis as unknown as Redis;
    const reference = { clientCode: "portal", localSessionId: "local", mode: "Gateway" };
    await writeGlobalSession(redis, "global", {
      version: GLOBAL_SESSION_VERSION,
      authTime: 456,
      user: { id: 1, username: "alice" },
    }, 60);
    await writeLocalSession(redis, "global", reference, { id: 1, username: "alice" });
    fakeRedis.advance(10_000);

    await expect(renewGlobalSession(redis, "global", 120, referenceSchema)).resolves.toBe(true);
    expect(await fakeRedis.ttl(globalSessionKey("global"))).toBe(120);
    expect(await fakeRedis.ttl(localSessionKey("portal", "local"))).toBe(120);
    expect(await fakeRedis.ttl(localSessionReverseKey("local"))).toBe(120);
    expect(await fakeRedis.ttl(localSessionSetKey("global"))).toBe(120);
    await expect(readGlobalSession(redis, "global", userSchema)).resolves.toMatchObject({ authTime: 456 });
  });

  test("global cleanup cascades to all related local session keys", async () => {
    const fakeRedis = new FakeRedis();
    const redis = fakeRedis as unknown as Redis;
    await writeGlobalSession(redis, "global", {
      version: GLOBAL_SESSION_VERSION,
      authTime: 789,
      user: { id: 1, username: "alice" },
    }, 60);
    await writeLocalSession(redis, "global", {
      clientCode: "portal",
      localSessionId: "local",
      mode: "Gateway",
    }, { id: 1, username: "alice" });

    await removeGlobalSession(redis, "global");

    expect(await fakeRedis.get(globalSessionKey("global"))).toBeNull();
    expect(await fakeRedis.get(localSessionKey("portal", "local"))).toBeNull();
    expect(await fakeRedis.get(localSessionReverseKey("local"))).toBeNull();
    expect(await fakeRedis.exists(localSessionSetKey("global"))).toBe(0);
  });
});
