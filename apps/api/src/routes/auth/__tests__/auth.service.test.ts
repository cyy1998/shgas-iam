import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createAuthService } from "../auth.service";
import { createLoginFailureService, LOGIN_FAILURE_WINDOW_SECONDS } from "../login-failure.helper";

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown;

class FakeRedis {
  private readonly sets = new Map<string, Array<{ member: string; score: number }>>();
  private readonly values = new Map<string, string>();
  private readonly expires = new Map<string, number>();
  private readonly deletedKeys: string[] = [];
  private timestamp = 0;

  reset() {
    this.sets.clear();
    this.values.clear();
    this.expires.clear();
    this.deletedKeys.length = 0;
    this.timestamp = 0;
  }

  now() {
    return this.timestamp;
  }

  advanceTime(ms: number) {
    this.timestamp += ms;
  }

  countFailures(userId: number) {
    return this.sets.get(`login-failures:user:${userId}`)?.length ?? 0;
  }

  isBlacklisted(userId: number) {
    return this.values.has(`login-blacklist:user:${userId}`);
  }

  deletedKeyCount(key: string) {
    return this.deletedKeys.filter(item => item === key).length;
  }

  multi() {
    const operations: RedisOperation[] = [];

    const pipeline = {
      zremrangebyscore: (key: string, min: number | string, max: number | string) => {
        operations.push(() => {
          const minScore = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
          const maxScore = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
          const existing = this.sets.get(key) ?? [];
          const next = existing.filter(item => item.score < minScore || item.score > maxScore);
          this.sets.set(key, next);
          return existing.length - next.length;
        });
        return pipeline;
      },
      zadd: (key: string, score: number, member: string) => {
        operations.push(() => {
          const existing = this.sets.get(key) ?? [];
          this.sets.set(key, [
            ...existing.filter(item => item.member !== member),
            { member, score },
          ]);
          return 1;
        });
        return pipeline;
      },
      zcard: (key: string) => {
        operations.push(() => this.sets.get(key)?.length ?? 0);
        return pipeline;
      },
      expire: (key: string, seconds: number) => {
        operations.push(() => {
          this.expires.set(key, this.timestamp + seconds * 1000);
          return 1;
        });
        return pipeline;
      },
      exec: async (): Promise<RedisResult[]> => operations.map(operation => [null, operation()]),
    };

    return pipeline;
  }

  async del(key: string) {
    this.deletedKeys.push(key);
    const deletedSet = this.sets.delete(key);
    const deletedValue = this.values.delete(key);
    this.expires.delete(key);
    return deletedSet || deletedValue ? 1 : 0;
  }

  async set(key: string, value: string, mode?: string, seconds?: number) {
    this.values.set(key, value);
    if (mode === "EX" && typeof seconds === "number") {
      this.expires.set(key, this.timestamp + seconds * 1000);
    }
    return "OK";
  }

  async get(key: string) {
    return await this.exists(key) > 0 ? this.values.get(key) ?? null : null;
  }

  async exists(key: string) {
    const expiresAt = this.expires.get(key);
    if (expiresAt !== undefined && expiresAt <= this.timestamp) {
      this.values.delete(key);
      this.expires.delete(key);
      return 0;
    }
    return this.values.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    if (await this.exists(key) === 0) {
      return -2;
    }
    const expiresAt = this.expires.get(key);
    if (expiresAt === undefined) {
      return -1;
    }
    return Math.ceil((expiresAt - this.timestamp) / 1000);
  }
}

const USER_ID = 1001;
const MOBILE = "17721462865";
const SESSION_ID = "00000000-0000-4000-8000-000000000000";

const fakeRedis = new FakeRedis();
const auditLogs: unknown[] = [];
const humanRiskLoginFailures: unknown[] = [];
const ensureActionAllowed = mock(async () => undefined);
const consumeVerificationCode = mock(async () => false);

let passwordMatches = false;
let activeMobileUser: { id: number } | null = { id: USER_ID };
let failureIdSequence = 0;

const userDetail = {
  id: USER_ID,
  username: "138550",
  wxId: null,
  orcasId: null,
  name: "测试用户",
  mobile: MOBILE,
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

const loginFailure = createLoginFailureService({
  redis: fakeRedis as any,
  clock: { now: mock(() => fakeRedis.now()) },
  random: { uuid: mock(() => `failure-${++failureIdSequence}`) },
});

function createService() {
  return createAuthService({
    userService: {
      checkPassword: mock(async () => passwordMatches),
      getActiveUserByMobile: mock(async () => activeMobileUser as any),
      getUserDetailByMobile: mock(async () => userDetail),
      getUserDetailByUsername: mock(async () => userDetail),
    },
    customSsoSession: {
      authorizeLocalSession: mock(async () => ""),
      createPrincipalSession: mock(async () => ({
        token: SESSION_ID,
        principalSession: {} as never,
      })),
    },
    mobileService: {
      consumeVerificationCode,
    },
    humanVerification: {
      ensureActionAllowed,
    },
    humanRiskService: {
      recordLoginFailure: mock(async (...args: unknown[]) => {
        humanRiskLoginFailures.push(args);
      }),
    },
    auditLogWriter: {
      recordAuditLog: mock(async (event: unknown) => {
        auditLogs.push(event);
      }),
      recordAuditLogFromContext: mock(async () => undefined),
    },
    loginFailure,
    config: {
      magicCode: "MAGIC",
    },
  } as any);
}

async function expectCredentialError(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toThrow(message);
}

function requestContext() {
  return {
    sourceApp: "iam",
    requestId: "req-auth",
    traceId: "11111111111111111111111111111111",
    ip: "203.0.113.10",
    userAgent: "auth-service-test",
    route: "/auth/login/password",
    method: "POST",
  };
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  humanRiskLoginFailures.length = 0;
  ensureActionAllowed.mockReset();
  ensureActionAllowed.mockResolvedValue(undefined);
  consumeVerificationCode.mockReset();
  consumeVerificationCode.mockResolvedValue(false);
  passwordMatches = false;
  activeMobileUser = { id: USER_ID };
  failureIdSequence = 0;
});

describe("createAuthService", () => {
  test("blacklists a user on the fifth password failure within the window", async () => {
    const authService = createService();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectCredentialError(
        authService.loginPassword(userDetail.username, "wrong-password"),
        `密码错误，当前已连续失败 ${attempt} 次，距离临时限制还有 ${5 - attempt} 次`,
      );
      expect(fakeRedis.isBlacklisted(USER_ID)).toBe(false);
    }

    await expectCredentialError(
      authService.loginPassword(userDetail.username, "wrong-password"),
      "密码错误，当前已连续失败 5 次，距离临时限制还有 0 次，账号已被临时限制，原因：密码错误达到 5 次，距离解封还有 30 分钟，请稍后再试",
    );

    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(true);
  });

  test("successful password login clears tracked failures", async () => {
    const authService = createService();

    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 1 次");
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 2 次");
    await loginFailure.blacklistLoginUser(USER_ID, "password");
    fakeRedis.advanceTime(LOGIN_FAILURE_WINDOW_SECONDS * 1000 + 1);

    passwordMatches = true;
    await expect(authService.loginPassword(userDetail.username, "correct-password")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(false);
    expect(fakeRedis.deletedKeyCount(`login-blacklist:user:${USER_ID}`)).toBeGreaterThan(0);
  });

  test("successful mobile login consumes the verification code and rejects replay", async () => {
    const authService = createService();
    consumeVerificationCode
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(authService.loginMobile(MOBILE, "1234")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });
    await expectCredentialError(authService.loginMobile(MOBILE, "1234"), "验证码错误");

    expect(consumeVerificationCode).toHaveBeenCalledWith("login", MOBILE, "1234");
  });

  test("failures outside the thirty-minute window do not count toward blacklisting", async () => {
    const baseTime = 1_800_000_000_000;

    for (let offset = 0; offset < 4; offset += 1) {
      await loginFailure.recordLoginFailure(USER_ID, baseTime + offset);
    }

    const result = await loginFailure.recordLoginFailure(
      USER_ID,
      baseTime + LOGIN_FAILURE_WINDOW_SECONDS * 1000 + 4,
    );

    expect(result).toEqual({
      failureCount: 1,
      remainingAttempts: 4,
      shouldBlacklist: false,
    });
  });

  test("mobile verification failures share the password failure streak", async () => {
    const authService = createService();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "密码错误");
    }

    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 4 次，距离临时限制还有 1 次",
    );
    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 5 次，距离临时限制还有 0 次，账号已被临时限制，原因：手机验证码错误达到 5 次，距离解封还有 30 分钟，请稍后再试",
    );

    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(true);
  });

  test("rejects login while a user is temporarily blacklisted", async () => {
    const authService = createService();

    await loginFailure.blacklistLoginUser(USER_ID, "password");
    fakeRedis.advanceTime(11 * 60 * 1000);
    passwordMatches = true;

    await expectCredentialError(
      authService.loginPassword(userDetail.username, "correct-password"),
      "账号已被临时限制，原因：密码错误达到 5 次，距离解封还有 19 分钟，请稍后再试",
    );

    expect(auditLogs[0]).toMatchObject({
      action: "auth.login.password",
      outcome: "failure",
      details: { reason: "blacklisted" },
    });
  });

  test("records human verification risk state for credential failures", async () => {
    const authService = createService();

    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "密码错误");
    await expectCredentialError(authService.loginMobile(MOBILE, "0000"), "验证码错误");

    expect(humanRiskLoginFailures).toEqual([
      ["passwordLogin", {
        subject: userDetail.username,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
      ["mobileLogin", {
        subject: MOBILE,
        ip: undefined,
        requestId: null,
        traceId: null,
      }],
    ]);
  });

  test("records login audit with request context", async () => {
    const authService = createService();
    passwordMatches = true;

    await expect(authService.loginPassword(userDetail.username, "correct-password", {
      requestContext: requestContext(),
    })).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(ensureActionAllowed).toHaveBeenCalledWith(
      "passwordLogin",
      undefined,
      expect.objectContaining({
        requestId: "req-auth",
        traceId: "11111111111111111111111111111111",
        subject: userDetail.username,
      }),
    );
    expect(auditLogs.at(-1)).toMatchObject({
      action: "auth.login.password",
      outcome: "success",
      requestId: "req-auth",
      traceId: "11111111111111111111111111111111",
      ip: "203.0.113.10",
      route: "/auth/login/password",
    });
  });

  test("stops login when human verification is required", async () => {
    const authService = createService();
    ensureActionAllowed.mockRejectedValue(
      new CustomError("需要人机校验", {
        code: ApiErrorCode.HumanVerificationRequired,
      }),
    );

    await expect(authService.loginPassword(userDetail.username, "wrong-password")).rejects.toHaveProperty(
      "code",
      ApiErrorCode.HumanVerificationRequired,
    );

    expect(humanRiskLoginFailures).toHaveLength(0);
    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
  });

  test("magic code password login does not record a failure", async () => {
    const authService = createService();

    await expect(authService.loginPassword(userDetail.username, "MAGIC")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
  });

  test("wrong mobile code for an unknown active user is not tracked", async () => {
    const authService = createService();
    activeMobileUser = null;

    await expectCredentialError(authService.loginMobile(MOBILE, "0000"), "验证码错误");

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
  });
});
