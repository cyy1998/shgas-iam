import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidAuthCodeError } from "@iam/api-core/errors/InvalidAuthCodeError";
import { ClientManagementLevel, ClientStatus, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown;

class FakeRedis {
  readonly values = new Map<string, string>();
  readonly zsets = new Map<string, Array<{ member: string; score: number }>>();
  private readonly expires = new Map<string, number>();
  private now = 0;
  failNextExec = false;

  reset() {
    this.values.clear();
    this.zsets.clear();
    this.expires.clear();
    this.now = 0;
    this.failNextExec = false;
  }

  localSessionKeys() {
    return Array.from(this.values.keys()).filter(key => key.startsWith("local_") && key.includes("_session:"));
  }

  reverseKeys() {
    return Array.from(this.values.keys()).filter(key => key.startsWith("local_session_reverse:"));
  }

  zsetSize(key: string) {
    return this.zsets.get(key)?.length ?? 0;
  }

  async set(key: string, value: string, mode?: string, seconds?: number) {
    this.values.set(key, value);
    if (mode === "EX" && typeof seconds === "number") {
      this.expires.set(key, this.now + seconds * 1000);
    }
    return "OK";
  }

  async get(key: string) {
    return await this.exists(key) > 0 ? this.values.get(key) ?? null : null;
  }

  async getdel(key: string) {
    const value = await this.get(key);
    await this.del(key);
    return value;
  }

  async del(key: string) {
    const deletedValue = this.values.delete(key);
    const deletedZset = this.zsets.delete(key);
    this.expires.delete(key);
    return deletedValue || deletedZset ? 1 : 0;
  }

  async exists(key: string) {
    if (this.isExpired(key)) {
      this.values.delete(key);
      this.zsets.delete(key);
      this.expires.delete(key);
      return 0;
    }
    return this.values.has(key) || this.zsets.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    if (await this.exists(key) === 0) {
      return -2;
    }
    const expiresAt = this.expires.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.ceil((expiresAt - this.now) / 1000);
  }

  async expire(key: string, seconds: number) {
    if (await this.exists(key) === 0) {
      return 0;
    }
    this.expires.set(key, this.now + seconds * 1000);
    return 1;
  }

  async zrange(key: string) {
    if (this.isExpired(key)) {
      this.zsets.delete(key);
      this.expires.delete(key);
      return [];
    }
    return (this.zsets.get(key) ?? [])
      .sort((left, right) => left.score - right.score)
      .map(item => item.member);
  }

  async zremrangebyscore(key: string, min: number | string, max: number | string) {
    const minScore = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
    const maxScore = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
    const existing = this.zsets.get(key) ?? [];
    const next = existing.filter(item => item.score < minScore || item.score > maxScore);
    this.zsets.set(key, next);
    return existing.length - next.length;
  }

  async zrem(key: string, member: string) {
    const existing = this.zsets.get(key) ?? [];
    const next = existing.filter(item => item.member !== member);
    this.zsets.set(key, next);
    return existing.length - next.length;
  }

  multi() {
    const operations: RedisOperation[] = [];

    const pipeline = {
      set: (key: string, value: string, mode?: string, seconds?: number) => {
        operations.push(() => this.set(key, value, mode, seconds));
        return pipeline;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => {
          const existing = this.zsets.get(key) ?? [];
          this.zsets.set(key, [
            ...existing.filter(item => item.member !== member),
            { member, score },
          ]);
          return 1;
        });
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        operations.push(() => {
          this.expires.set(key, this.now + seconds * 1000);
          return 1;
        });
        return pipeline;
      },
      del: (key: string) => {
        operations.push(() => this.del(key));
        return pipeline;
      },
      zrem: (key: string, member: string) => {
        operations.push(() => this.zrem(key, member));
        return pipeline;
      },
      exec: async (): Promise<RedisResult[]> => {
        if (this.failNextExec) {
          this.failNextExec = false;
          throw new Error("redis transaction failed");
        }
        return await Promise.all(operations.map(async operation => [null, await operation()] as RedisResult));
      },
    };

    return pipeline;
  }

  private isExpired(key: string) {
    const expiresAt = this.expires.get(key);
    return expiresAt !== undefined && expiresAt <= this.now;
  }
}

const fakeRedis = new FakeRedis();
const auditLogs: unknown[][] = [];
const logoutNotifications: unknown[] = [];
const logger = {
  info: mock(() => undefined),
  warn: mock(() => undefined),
};
let fetchShouldFail = false;

const userDetail = {
  id: 1001,
  username: "138550",
  wxId: null,
  orcasId: null,
  name: "测试用户",
  password: null,
  mobile: "17721462865",
  userType: UserType.Formal,
  orderNum: 1,
  status: UserStatus.Enable,
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
  employments: [],
  roles: [],
  privileges: [],
};

const client = {
  id: 1,
  clientCode: "independent",
  clientName: "Independent",
  clientSecret: "secret",
  url: "https://app.example.com",
  status: ClientStatus.Enable,
  extAttributes: {
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/sso/logout",
    managementLevel: ClientManagementLevel.Independent,
    requireOrcas: false,
    userExcluding: [],
    validRedirectUrls: ["https://app.example.com"],
  },
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
};

const redirectPatternsByClientCode: Record<string, string[]> = {
  "pattern-callback": ["https://*.example.com/app/*"],
  "pattern-no-match": ["https://*.com/callback", "https://app.example.com/foo"],
  "pattern-path-boundary": ["https://app.example.com/foo"],
  "pattern-root-domain": ["https://*.example.com"],
  "pattern-skip-invalid": ["https://*.com/callback", "https://app.example.com/foo"],
};

function getMockClientByCode(clientCode: string) {
  const validRedirectUrls = redirectPatternsByClientCode[clientCode];
  if (validRedirectUrls !== undefined) {
    return {
      ...client,
      clientCode,
      extAttributes: {
        ...client.extAttributes,
        validRedirectUrls,
      },
    };
  }

  return clientCode === client.clientCode ? client : null;
}

mock.module("@api/env", () => ({
  default: {
    AUTH_CODE_EXPIRE_TIME: 60,
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
    REDIS_EXPIRE_TIME: 3600,
  },
}));

mock.module("@api/lib/infra/redis", () => ({ default: fakeRedis }));
mock.module("@api/lib/logger", () => ({ logger }));
mock.module("@api/services/audit/events/auth.audit", () => ({
  async recordLocalLoginSuccess(...args: unknown[]) {
    auditLogs.push(args);
  },
}));
mock.module("@api/services/client/client.service", () => ({
  async getClientByCode(clientCode: string) {
    return getMockClientByCode(clientCode);
  },
}));
mock.module("@api/lib/integrations/orcas", () => ({ default: { orcasLogin: mock(async () => ({ orcasId: "orcas", orcasSessionId: "orcas-session" })) } }));
mock.module("@api/lib/integrations/wechat", () => ({ default: { getWxUserId: mock(async () => "wx-id") } }));
mock.module("@api/services/user/user.service", () => ({
  async getUserDetailByUsername() {
    return userDetail;
  },
  async getUserDetailByWxId() {
    return userDetail;
  },
}));

const ssoService = await import("../sso.service");
const sessionService = await import("@api/services/session/session.service");

async function createGlobalSession(globalSessionId = "global-session") {
  await fakeRedis.set(`global_session:${globalSessionId}`, JSON.stringify({
    version: 1,
    authTime: 1_700_000_000,
    user: userDetail,
  }), "EX", 3600);
  return globalSessionId;
}

async function createAuthCode(code: string, globalSessionId: string) {
  await fakeRedis.set(`auth_code:${code}`, JSON.stringify({
    sessionId: globalSessionId,
    data: JSON.stringify(userDetail),
  }), "EX", 60);
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  logoutNotifications.length = 0;
  logger.warn.mockClear();
  fetchShouldFail = false;
  globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
    logoutNotifications.push(init?.body);
    if (fetchShouldFail) {
      throw new Error("client logout failed");
    }
    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;
});

describe("SSO redirect pattern validation", () => {
  test("callback accepts redirect URLs matching a valid wildcard pattern", async () => {
    const globalSessionId = await createGlobalSession();
    await createAuthCode("code-pattern", globalSessionId);

    await expect(ssoService.callback(
      "code-pattern",
      "pattern-callback",
      "https://tenant.example.com/app/callback?next=1",
    )).resolves.toMatchObject({ token: expect.any(String) });
  });

  test("authorize skips invalid historical patterns and accepts a later valid match", async () => {
    const globalSessionId = await createGlobalSession();

    await expect(ssoService.authorize(
      globalSessionId,
      "pattern-skip-invalid",
      "https://app.example.com/foo",
    )).resolves.toMatchObject({ isLogin: true });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "pattern-skip-invalid",
      pattern: "https://*.com/callback",
    }), "invalid client redirect url pattern");
  });

  test("authorize rejects when no valid pattern matches", async () => {
    await expect(ssoService.authorize(
      "global-session",
      "pattern-no-match",
      "https://app.example.com/bar",
    )).rejects.toThrow("非法重定向地址");
  });

  test("path patterns respect segment boundaries", async () => {
    await expect(ssoService.authorize(
      "global-session",
      "pattern-path-boundary",
      "https://app.example.com/foobar",
    )).rejects.toThrow("非法重定向地址");
  });

  test("host wildcard patterns do not match the root domain", async () => {
    await expect(ssoService.authorize(
      "global-session",
      "pattern-root-domain",
      "https://example.com",
    )).rejects.toThrow("非法重定向地址");
  });
});

describe("SSO Redis session consistency", () => {
  test("consumes an auth code once for Independent token exchange", async () => {
    const globalSessionId = await createGlobalSession();
    await createAuthCode("code-1", globalSessionId);

    const result = await ssoService.setToken("code-1", client.clientCode, client.clientSecret);

    expect(result.ttl).toBeGreaterThan(0);
    expect(result.userInfo.username).toBe(userDetail.username);
    expect(auditLogs).toHaveLength(1);
    expect(fakeRedis.localSessionKeys()).toHaveLength(1);
    expect(fakeRedis.reverseKeys()).toHaveLength(1);
    expect(fakeRedis.zsetSize(`local_session_set:${globalSessionId}`)).toBe(1);
    await expect(
      ssoService.setToken("code-1", client.clientCode, client.clientSecret),
    )
      .rejects
      .toBeInstanceOf(InvalidAuthCodeError);
    expect(fakeRedis.localSessionKeys()).toHaveLength(1);
  });

  test("rejects token exchange when the referenced global session is expired", async () => {
    await createAuthCode("code-2", "missing-global-session");

    await expect(
      ssoService.setToken("code-2", client.clientCode, client.clientSecret),
    )
      .rejects
      .toBeInstanceOf(AuthzUnauthorizedError);

    expect(fakeRedis.localSessionKeys()).toHaveLength(0);
    expect(fakeRedis.reverseKeys()).toHaveLength(0);
    expect(fakeRedis.zsetSize("local_session_set:missing-global-session")).toBe(0);
  });

  test("does not leave a usable local session when Redis transaction fails", async () => {
    const globalSessionId = await createGlobalSession();
    fakeRedis.failNextExec = true;

    await expect(sessionService.setLocalSession(
      globalSessionId,
      client.clientCode,
      userDetail,
      ClientManagementLevel.Independent,
    )).rejects.toThrow("redis transaction failed");

    expect(fakeRedis.localSessionKeys()).toHaveLength(0);
    expect(fakeRedis.reverseKeys()).toHaveLength(0);
    expect(fakeRedis.zsetSize(`local_session_set:${globalSessionId}`)).toBe(0);
    expect(auditLogs).toHaveLength(0);
  });

  test("cleans IAM Redis sessions even when Independent logout notification fails", async () => {
    const globalSessionId = await createGlobalSession();
    await sessionService.setLocalSession(
      globalSessionId,
      client.clientCode,
      userDetail,
      ClientManagementLevel.Independent,
    );
    fetchShouldFail = true;

    await expect(ssoService.logout(globalSessionId)).resolves.toBe(true);

    expect(await fakeRedis.get(`global_session:${globalSessionId}`)).toBeNull();
    expect(fakeRedis.localSessionKeys()).toHaveLength(0);
    expect(fakeRedis.reverseKeys()).toHaveLength(0);
    expect(fakeRedis.zsetSize(`local_session_set:${globalSessionId}`)).toBe(0);
    expect(logoutNotifications).toHaveLength(1);
  });
});
