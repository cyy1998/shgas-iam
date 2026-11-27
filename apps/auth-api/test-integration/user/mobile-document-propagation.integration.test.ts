import { afterEach, expect, test } from "bun:test";
import process from "node:process";
import { createAuthApiRepositories } from "@auth-api/composition/repositories";
import { createAuthApiUnitOfWork } from "@auth-api/composition/tx";
import { VerificationCodeUsage } from "@auth-api/enums/verificationCode.usage";
import { createMobileService } from "@auth-api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@auth-api/services/mobile/mobile-code-cooldown";
import type { UserMobileBindingPort } from "@auth-api/services/user/user.port";
import { createUserService } from "@auth-api/services/user/user.service";
import { createUserMobileBinding } from "@auth-api/services/user/user-mobile-binding.helper";
import { ApiErrorCode, UserStatus } from "@iam/contracts";
import { createAuditLogWriter } from "@iam/db/audit";
import { auditLogs, userDocumentOutboxEntries, users } from "@iam/db/schema";
import { UserNotFoundError } from "@iam/domain/user";
import { mapUnitOfWork } from "@iam/unit-of-work";
import Redis from "ioredis";
import {
  closeAuthApiRedisConnection,
  ownAuthApiTestExecutor,
  resetAuthApiRedisTestDatabase,
} from "../support/fixture-lifecycle";
import { useAuthApiPostgresTestHarness } from "../support/postgres-test-file.fixture";

const getDatabase = useAuthApiPostgresTestHarness();
afterEach(resetAuthApiRedisTestDatabase);

function unused(): never {
  throw new Error("Unused mobile-binding test dependency");
}

test("a failed mobile write leaves the code spent and keeps the sending cooldown", async () => {
  const pg = getDatabase();
  const [user] = await pg.db
    .insert(users)
    .values({ username: "holder", name: "Holder", mobile: "13800000000" })
    .returning();
  if (!user) throw new Error("User fixture was not inserted");
  const consumed = Promise.withResolvers<void>();
  const continueWrite = Promise.withResolvers<void>();
  const phone = "13900000000";
  const { mobileService, closeRedis } = createSmsFixture("1234");
  const repositories = createAuthApiRepositories(getDatabase().db);
  const service = makeUserService({
    ...mobileService,
    async consumeVerificationCode(...args) {
      const valid = await mobileService.consumeVerificationCode(...args);
      if (valid) {
        consumed.resolve();
        await continueWrite.promise;
      }
      return valid;
    },
  });
  try {
    await mobileService.sendCode(phone, VerificationCodeUsage.BindPhone);
    const pending = service.setMobile(user.id, phone, "1234");
    try {
      await Promise.race([consumed.promise, pending]);
      const paused = await repositories.user.updateEnabledUserStatus(user.id, UserStatus.Pause);
      expect(paused?.status).toBe(UserStatus.Pause);
      continueWrite.resolve();
      const [failed] = await Promise.allSettled([pending]);
      expect(failed).toEqual({ status: "rejected", reason: expect.any(UserNotFoundError) });
    } finally {
      continueWrite.resolve();
      await Promise.allSettled([pending]);
    }
    const account = await pg.db.query.users.findFirst({ where: { id: user.id } });
    const audits = await pg.db.select().from(auditLogs);
    const work = await pg.db.select().from(userDocumentOutboxEntries);
    expect(account?.mobile).toBe("13800000000");
    expect(audits).toEqual([]);
    expect(work).toEqual([]);
    const [repeat, resend] = await Promise.allSettled([
      service.setMobile(user.id, phone, "1234"),
      mobileService.sendCode(phone, VerificationCodeUsage.BindPhone),
    ]);
    expect(repeat).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.InvalidVerificationCode } });
    expect(resend).toMatchObject({ status: "rejected", reason: { code: ApiErrorCode.SmsCooldown } });
    if (resend?.status !== "rejected") throw new Error("The SMS cooldown was lost");
    expect(resend.reason.retryAfterSeconds).toBeGreaterThan(0);
    expect(resend.reason.retryAfterSeconds).toBeLessThanOrEqual(60);
  } finally {
    await closeRedis();
  }
});

function makeUserService(mobileService: UserMobileBindingPort) {
  const repositories = createAuthApiRepositories(getDatabase().db);
  const auditLogWriter = createAuditLogWriter({ sourceApp: "auth-api", auditRepository: repositories.audit });
  const uow = createAuthApiUnitOfWork({
    db: getDatabase().db,
    logger: { warn() {}, error() {} },
    clock: { nowDate: () => new Date("2026-10-26T12:00:00Z") },
    userDocumentJobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length, jobIds: [] };
      },
    },
  });
  return createUserService({
    userRepository: repositories.user,
    documentQuery: { getLoginProfileByUserId: unused, getMobileByUsername: unused },
    mobileBinding: createUserMobileBinding({
      userRepository: repositories.user,
      auditLogWriter,
      mobileService,
    }),
    passwordHelper: { assertStrongPassword: unused, hashUserPassword: unused, verifyUserPassword: unused },
    sessionRevocation: { revokeUserSessions: unused },
    subjectAccessLifecycle: { run: unused },
    uow: mapUnitOfWork(uow, (tx) => ({
      userRepository: tx.repositories.user,
      auditLogWriter: tx.auditLogWriter,
      subjectAccessMutation: tx.subjectAccessMutation,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
}

function createSmsFixture(code: string) {
  const redisUrl = process.env.IAM_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_TEST_REDIS_URL is required");
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 });
  const closeRedis = ownAuthApiTestExecutor(() => closeAuthApiRedisConnection(redis));
  const mobileService = createMobileService({
    cooldown: createMobileCodeCooldown(redis),
    redis,
    smsSender: {
      async sendVerificationCode() {
        return { success: true, code };
      },
      sendMessage: unused,
    },
    userRepository: createAuthApiRepositories(getDatabase().db).user,
    config: { verificationCodeTtlSeconds: 180 },
  });
  return { mobileService, closeRedis };
}
