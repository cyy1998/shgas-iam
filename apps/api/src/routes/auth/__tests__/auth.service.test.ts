import { CustomError } from "@iam/api-core/errors/CustomError";
import { ApiErrorCode, ServiceStatusCode, UserStatus, UserType } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.restore();

type RedisResult = [Error | null, unknown];
type RedisOperation = () => unknown;

class FakeRedis {
  private readonly sets = new Map<string, Array<{ member: string; score: number }>>();

  reset() {
    this.sets.clear();
  }

  countFailures(userId: number) {
    return this.sets.get(`login-failures:user:${userId}`)?.length ?? 0;
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
    return this.sets.delete(key) ? 1 : 0;
  }
}

const USER_ID = 1001;
const MOBILE = "17721462865";
const fakeRedis = new FakeRedis();
const SESSION_ID = "00000000-0000-4000-8000-000000000000";
const loginLogs: unknown[] = [];
const pausedUserIds: number[] = [];
const humanRiskLoginFailures: unknown[] = [];
const ensureActionAllowed = mock(async () => undefined);

let passwordMatches = false;
let verificationCodeMatches = false;
let activeMobileUser: { id: number } | null = { id: USER_ID };

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
    DEFAULT_USER_PASSWORD: "default-password",
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

mock.module("@api/services/session/session.repository", () => ({
  async loginLog(...args: unknown[]) {
    loginLogs.push(args);
  },
}));

mock.module("@api/services/session/session.service", () => ({
  async checkVerificationCode() {
    return verificationCodeMatches;
  },
  async setGlobalSession() {
    return SESSION_ID;
  },
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
      && (error.code === ApiErrorCode.HumanVerificationRequired
        || error.legacyCode === ServiceStatusCode.HumanVerificationRequired);
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
  loginLogs.length = 0;
  pausedUserIds.length = 0;
  humanRiskLoginFailures.length = 0;
  ensureActionAllowed.mockReset();
  ensureActionAllowed.mockResolvedValue(undefined);
  passwordMatches = false;
  verificationCodeMatches = false;
  activeMobileUser = { id: USER_ID };
});

describe("auth login failure suspension", () => {
  test("pauses a user on the fifth password failure within the window", async () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectCredentialError(
        authService.loginPassword(userDetail.username, "wrong-password"),
        `密码错误，当前已连续失败 ${attempt} 次，距离账号暂停还有 ${5 - attempt} 次`,
      );
      expect(pausedUserIds).toHaveLength(0);
    }

    await expectCredentialError(
      authService.loginPassword(userDetail.username, "wrong-password"),
      "密码错误，当前已连续失败 5 次，距离账号暂停还有 0 次，账号已暂停",
    );

    expect(pausedUserIds).toEqual([USER_ID]);
  });

  test("successful password login clears tracked failures", async () => {
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 1 次");
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 2 次");
    expect(fakeRedis.countFailures(USER_ID)).toBe(2);

    passwordMatches = true;
    await expect(authService.loginPassword(userDetail.username, "correct-password")).resolves.toEqual({
      isMobileSet: true,
      token: SESSION_ID,
    });

    expect(fakeRedis.countFailures(USER_ID)).toBe(0);

    passwordMatches = false;
    await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "当前已连续失败 1 次");
    expect(pausedUserIds).toHaveLength(0);
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
      shouldSuspend: false,
    });
  });

  test("mobile verification failures share the password failure streak", async () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expectCredentialError(authService.loginPassword(userDetail.username, "wrong-password"), "密码错误");
    }

    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 4 次，距离账号暂停还有 1 次",
    );
    expect(pausedUserIds).toHaveLength(0);

    await expectCredentialError(
      authService.loginMobile(MOBILE, "0000"),
      "验证码错误，当前已连续失败 5 次，距离账号暂停还有 0 次，账号已暂停",
    );
    expect(pausedUserIds).toEqual([USER_ID]);
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
        legacyCode: ServiceStatusCode.HumanVerificationRequired,
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
        legacyCode: ServiceStatusCode.HumanVerificationRequired,
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
