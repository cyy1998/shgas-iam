import { afterEach, expect, test } from "bun:test";
import process from "node:process";
import { createAuthApiRepositories } from "@auth-api/composition/repositories";
import { VerificationCodeUsage } from "@auth-api/enums/verificationCode.usage";
import { createAccountRecoveryService } from "@auth-api/services/account-recovery/account-recovery.service";
import { createMobileService } from "@auth-api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@auth-api/services/mobile/mobile-code-cooldown";
import { createResetPasswordUseCase } from "@auth-api/use-cases/account-recovery/reset-password/reset-password.use-case";
import { createVerifyPasswordResetCodeUseCase } from "@auth-api/use-cases/account-recovery/verify-password-reset-code/verify-password-reset-code.use-case";
import { ApiErrorCode } from "@iam/contracts";
import { createAuditLogWriter } from "@iam/db/audit";
import { auditLogs, users } from "@iam/db/schema";
import { createUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import {
  closeAuthApiRedisConnection,
  ownAuthApiTestExecutor,
  resetAuthApiRedisTestDatabase,
} from "../support/fixture-lifecycle";
import { useAuthApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useAuthApiPostgresTestHarness();
afterEach(resetAuthApiRedisTestDatabase);

test("a rolled-back password reset spends its code and only one submission can use the next code", async () => {
  const redisUrl = process.env.IAM_AUTH_API_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_AUTH_API_TEST_REDIS_URL is required");
  const pg = getDatabase();
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 });
  const close = ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis));

  try {
    const username = "reset-user";
    const phone = "13800000002";
    const input = { username, code: "1234", newPassword: "NewPassword123" };
    const usage = VerificationCodeUsage.ResetPassword;
    await pg.db.insert(users).values({ username, name: "Reset user", mobile: phone, password: "original" });
    const repositories = createAuthApiRepositories(pg.db);
    const userLookup = { getActiveUserByUsername: repositories.user.getUserByUsername };
    const auditLogWriter = createAuditLogWriter({ sourceApp: "iam", auditRepository: repositories.audit });
    const boundMobileResolver = createAccountRecoveryService({ userLookup });
    let nextCode = input.code;
    const verificationCodes = createMobileService({
      redis,
      cooldown: createMobileCodeCooldown(redis),
      userRepository: repositories.user,
      smsSender: {
        sendVerificationCode: async () => ({ success: true, code: nextCode }),
        sendMessage: async () => true,
      },
      config: { verificationCodeTtlSeconds: 180 },
    });
    const verify = createVerifyPasswordResetCodeUseCase({
      auditLogWriter,
      boundMobileResolver,
      mobileCodeVerifier: verificationCodes,
    });
    let failWrite = true;
    const reset = createResetPasswordUseCase({
      auditLogWriter,
      boundMobileResolver,
      userLookup,
      verificationCodes,
      passwordHasher: { hashUserPassword: async (password) => `hashed:${password}` },
      uow: createUnitOfWork({
        db: pg.db,
        logger: { warn() {}, error() {} },
        createTxPorts(tx) {
          const txRepositories = createAuthApiRepositories(tx);
          return {
            auditLogWriter: createAuditLogWriter({ sourceApp: "iam", auditRepository: txRepositories.audit }),
            userWriter: {
              async setPassword(userId, password) {
                await txRepositories.user.setPassword(userId, password);
                if (failWrite) throw new Error("forced rollback after password update");
              },
            },
          };
        },
      }),
    });

    await verificationCodes.sendCode(phone, usage);
    const prechecked = await verify.execute(input);
    expect(prechecked).toBe(true);
    const [failed] = await Promise.allSettled([reset.execute(input)]);
    expect(failed).toMatchObject({ status: "rejected", reason: { message: "forced rollback after password update" } });
    const beforeRetry = await repositories.user.getUserByUsername(username);
    expect(beforeRetry?.password).toBe("original");

    const [repeat, resend] = await Promise.allSettled([reset.execute(input), verificationCodes.sendCode(phone, usage)]);
    expect(repeat).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.InvalidVerificationCode } });
    expect(resend).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    if (resend?.status !== "rejected") throw new Error("The SMS cooldown was lost");
    expect(resend.reason.retryAfterSeconds).toBeGreaterThan(0);
    expect(resend.reason.retryAfterSeconds).toBeLessThanOrEqual(60);

    await redis.pexpire(`mobile-code-cooldown:${phone}`, 0);
    nextCode = "5678";
    failWrite = false;
    await verificationCodes.sendCode(phone, usage);
    const submission = { ...input, code: nextCode };
    const results = await Promise.allSettled([reset.execute(submission), reset.execute(submission)]);
    expect(results).toContainEqual({ status: "fulfilled", value: true });
    expect(results.filter(({ status }) => status === "rejected")).toEqual([
      { status: "rejected", reason: expect.objectContaining({ code: ApiErrorCode.InvalidVerificationCode }) },
    ]);
    const account = await repositories.user.getUserByUsername(username);
    expect(account?.password).toBe(`hashed:${input.newPassword}`);
    const audits = await pg.db.select().from(auditLogs).where(eq(auditLogs.action, "auth.password.reset"));
    expect(audits.filter(({ outcome }) => outcome === "success")).toHaveLength(1);
  } finally {
    await close();
  }
});
