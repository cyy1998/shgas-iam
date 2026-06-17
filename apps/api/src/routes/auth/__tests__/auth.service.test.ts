import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.restore();

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown;

class FakeRedis {
  private readonly sets = new Map<string, Array<{ member: string; score: number }>>();
  private readonly values = new Map<string, string>();
  private readonly expires = new Map<string, number>();
  private readonly deletedKeys: string[] = [];
  private now = 0;

  reset() {
    this.sets.clear();
    this.values.clear();
    this.expires.clear();
    this.deletedKeys.length = 0;
    this.now = 0;
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

  advanceTime(ms: number) {
    this.now += ms;
  }

  multi() {
    const operations: RedisOperation[] = [];
    const sets = this.sets;

    const pipeline = {
      zremrangebyscore(key: string, min: number | string, max: number | string) {
        operations.push(() => {
          const minScore = min === "-inf" ? Number.NEGATIVE_INFINITY : Number(min);
          const maxScore = max === "+inf" || max === "inf" ? Number.POSITIVE_INFINITY : Number(max);
          const existing = sets.get(key) ?? [];
          const next = existing.filter(item => item.score < minScore || item.score > maxScore);
          sets.set(key, next);
          return existing.length - next.length;
        });
        return pipeline;
      },
      zadd(key: string, score: number, member: string) {
        operations.push(() => {
          const existing = sets.get(key) ?? [];
          sets.set(key, [
            ...existing.filter(item => item.member !== member),
            { member, score },
          ]);
          return 1;
        });
        return pipeline;
      },
      zcard(key: string) {
        operations.push(() => sets.get(key)?.length ?? 0);
        return pipeline;
      },
      expire() {
        operations.push(() => 1);
        return pipeline;
      },
      async exec(): Promise<RedisResult[]> {
        return operations.map(operation => [null, operation()]);
      },
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
      this.expires.set(key, this.now + seconds * 1000);
    }
    return "OK";
  }

  async get(key: string) {
    return await this.exists(key) > 0 ? this.values.get(key) ?? null : null;
  }

  async exists(key: string) {
    const expiresAt = this.expires.get(key);
    if (expiresAt !== undefined && expiresAt <= this.now) {
      this.values.delete(key);
      this.expires.delete(key);
      return 0;
    }
    return this.values.has(key) ? 1 : 0;
  }

  async ttl(key: string) {
    const expiresAt = this.expires.get(key);
    if (!this.values.has(key))
      return -2;
    if (expiresAt === undefined)
      return -1;
    const ttl = Math.ceil((expiresAt - this.now) / 1000);
    if (ttl <= 0) {
      this.values.delete(key);
      this.expires.delete(key);
      return -2;
    }
    return ttl;
  }
}

const USER_ID = 1001;
const MOBILE = "17721462865";
const fakeRedis = new FakeRedis();
const SESSION_ID = "00000000-0000-4000-8000-000000000000";
const auditLogs: unknown[][] = [];
const pausedUserIds: number[] = [];
const humanRiskLoginFailures: unknown[] = [];
const ensureActionAllowed = mock(async () => undefined);

let passwordMatches = false;
let verificationCodeMatches = false;
let activeMobileUser: { id: number } | null = { id: USER_ID };
const consumeVerificationCode = mock(async () => verificationCodeMatches);

const userDetail = {
  id: USER_ID,
  username: "138550",
  wxId: null,
  name: "测试用户",
  password: null,
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

mock.module("@api/env", () => ({
  default: {
    MAGIC_CODE: "MAGIC",
    NODE_ENV: "test",
    PASSWORD_HASH_ROUNDS: 4,
    REDIS_EXPIRE_TIME: 3600,
  },
}));

mock.module("@api/lib/infra/redis", () => ({
  default: fakeRedis,
}));

mock.module("@api/services/user/user.service", () => ({
  async checkPassword() {
    return passwordMatches;
  },
  async getActiveUserByMobile() {
    return activeMobileUser;
  },
  async getUserDetailByMobile() {
    return userDetail;
  },
  async getUserDetailByUsername() {
    return userDetail;
  },
  async pauseEnabledUser(userId: number) {
    pausedUserIds.push(userId);
    return { ...userDetail, status: UserStatus.Pause };
  },
}));

mock.module("@api/services/audit/audit.service", () => ({
  async recordAuditLog(...args: unknown[]) {
    auditLogs.push(args);
  },
}));

mock.module("@api/services/session/session.service", () => ({
  async setGlobalSession() {
    return SESSION_ID;
  },
}));

mock.module("@api/services/mobile/mobile.service", () => ({
  consumeVerificationCode,
}));

mock.module("@api/services/human-verification/cap.service", () => ({
  HumanVerificationAction: {
    MobileLogin: "mobileLogin",
    PasswordLogin: "passwordLogin",
  },
  ensureActionAllowed,
}));

mock.module("@api/services/human-verification/human-verification.error", () => ({
  isHumanVerificationRequiredError(error: unknown) {
    return error instanceof CustomError
      && error.code === ApiErrorCode.HumanVerificationRequired;
  },
}));

mock.module("@api/services/human-verification/human-risk.service", () => ({
  async recordLoginFailure(...args: unknown[]) {
    humanRiskLoginFailures.push(args);
  },
}));

const authService = await import("../auth.service");
const loginFailureHelper = await import("../login-failure.helper");

async function expectCredentialError(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toThrow(message);
}

beforeEach(() => {
  fakeRedis.reset();
  auditLogs.length = 0;
  pausedUserIds.length = 0;
  humanRiskLoginFailures.length = 0;
  ensureActionAllowed.mockReset();
  ensureActionAllowed.mockResolvedValue(undefined);
  consumeVerificationCode.mockReset();
  consumeVerificationCode.mockImplementation(async () => verificationCodeMatches);
  passwordMatches = false;
  verificationCodeMatches = false;
  activeMobileUser = { id: USER_ID };
});

describe("auth login failure temporary blacklist", () => {
  test("blacklists a user on the fifth password failure within the window", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectCredentialError(
        authService.loginPassword(userDetail.username, "wrong-password"),
        `密码错误，当前已连续失败 ${attempt} 次，距离临时限制还有 ${5 - attempt} 次`,
      );
      expect(pausedUserIds).toHaveLength(0);
      expect(fakeRedis.isBlacklisted(USER_ID)).toBe(false);
    }

    await expectCredentialError(
      authService.loginPassword(userDetail.username, "wrong-password"),
      "密码错误，当前已连续失败 5 次，距离临时限制还有 0 次，账号已被临时限制，原因：密码错误达到 5 次，距离解封还有 30 分钟，请稍后再试",
    );

    expect(pausedUserIds).toHaveLength(0);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(true);
  });

  test("successful password login clears tracked failures", async () => {
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 1 次");
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 2 次");
    await loginFailureHelper.blacklistLoginUser(USER_ID, "password");
    fakeRedis.advanceTime(loginFailureHelper.LOGIN_FAILURE_WINDOW_SECONDS * 1000 + 1);
    expect(fakeRedis.countFailures(USER_ID)).toBe(2);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(true);

    passwordMatches = true;
    await expect(authService.loginPassword(userDetail.username, "correct-password")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(false);
    expect(fakeRedis.deletedKeyCount(`login-blacklist:user:${USER_ID}`)).toBeGreaterThan(0);

    passwordMatches = false;
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 1 次");
    expect(pausedUserIds).toHaveLength(0);
  });

  test("successful mobile login consumes the verification code and rejects replay", async () => {
    consumeVerificationCode
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(authService.loginMobile(MOBILE, "1234")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    await expectCredentialError(authService.loginMobile(MOBILE, "1234"), "验证码错误");

    expect(consumeVerificationCode).toHaveBeenCalledTimes(2);
    expect(consumeVerificationCode).toHaveBeenCalledWith("login", MOBILE, "1234");
  });

  test("failures outside the thirty-minute window do not count toward suspension", async () => {
    const baseTime = 1_800_000_000_000;

    for (let offset = 0; offset < 4; offset += 1) {
      await loginFailureHelper.recordLoginFailure(USER_ID, baseTime + offset);
    }

    const result = await loginFailureHelper.recordLoginFailure(
      USER_ID,
      baseTime + loginFailureHelper.LOGIN_FAILURE_WINDOW_SECONDS * 1000 + 4,
    );

    expect(result).toEqual({
      failureCount: 1,
      remainingAttempts: 4,
      shouldBlacklist: false,
    });
  });

  test("mobile verification failures share the password failure streak", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "密码错误");
    }

    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 4 次，距离临时限制还有 1 次",
    );
    expect(pausedUserIds).toHaveLength(0);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(false);

    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 5 次，距离临时限制还有 0 次，账号已被临时限制，原因：手机验证码错误达到 5 次，距离解封还有 30 分钟，请稍后再试",
    );
    expect(pausedUserIds).toHaveLength(0);
    expect(fakeRedis.isBlacklisted(USER_ID)).toBe(true);
  });

  test("rejects password login while user is temporarily blacklisted", async () => {
    await loginFailureHelper.blacklistLoginUser(USER_ID, "password");
    fakeRedis.advanceTime(11 * 60 * 1000);

    passwordMatches = true;
    await expectCredentialError(
      authService.loginPassword(userDetail.username, "correct-password"),
      "账号已被临时限制，原因：密码错误达到 5 次，距离解封还有 19 分钟，请稍后再试",
    );

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.[0]).toMatchObject({
      action: "auth.login.password",
      outcome: "failure",
      details: { reason: "blacklisted" },
    });
  });

  test("rejects mobile login while user is temporarily blacklisted", async () => {
    await loginFailureHelper.blacklistLoginUser(USER_ID, "mobile");
    fakeRedis.advanceTime(11 * 60 * 1000);

    verificationCodeMatches = true;
    await expectCredentialError(
      authService.loginMobile(MOBILE, "1234"),
      "账号已被临时限制，原因：手机验证码错误达到 5 次，距离解封还有 19 分钟，请稍后再试",
    );

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(auditLogs).toHaveLength(1);
    expect(auditLogs[0]?.[0]).toMatchObject({
      action: "auth.login.mobile",
      outcome: "failure",
      details: { reason: "blacklisted" },
    });
  });

  test("records human verification risk state for credential failures", async () => {
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "密码错误");
    await expectCredentialError(authService.loginMobile(MOBILE, "0000"), "验证码错误");

    expect(humanRiskLoginFailures).toEqual([
      ["passwordLogin", { subject: userDetail.username }],
      ["mobileLogin", { subject: MOBILE }],
    ]);
  });

  test("stops password login when human verification is required", async () => {
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

  test("stops mobile login when human verification is required", async () => {
    ensureActionAllowed.mockRejectedValue(
      new CustomError("需要人机校验", {
        code: ApiErrorCode.HumanVerificationRequired,
      }),
    );

    await expect(authService.loginMobile(MOBILE, "0000")).rejects.toHaveProperty(
      "code",
      ApiErrorCode.HumanVerificationRequired,
    );

    expect(humanRiskLoginFailures).toHaveLength(0);
    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
  });

  test("magic code login does not record a failure", async () => {
    await expect(authService.loginPassword(userDetail.username, "MAGIC")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(pausedUserIds).toHaveLength(0);
  });

  test("wrong mobile code for an unknown active user is not tracked", async () => {
    activeMobileUser = null;

    await expectCredentialError(authService.loginMobile(MOBILE, "0000"), "验证码错误");

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);
    expect(pausedUserIds).toHaveLength(0);
  });
});
