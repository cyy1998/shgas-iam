import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import process from "node:process";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createMobileService } from "@api/services/mobile/mobile.service";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import type { UserMobileBindingPort } from "@api/services/user/user.port";
import { createUserService } from "@api/services/user/user.service";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { ApiErrorCode, UserStatus } from "@iam/contracts";
import { createAuditLogWriter } from "@iam/db/audit";
import { auditLogs, userDocumentOutboxEntries, users } from "@iam/db/schema";
import { UserNotFoundError } from "@iam/domain/user";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { eq } from "drizzle-orm";
import Redis from "ioredis";
import { fixture as createRootAuthenticationFixture } from "../authentication/root-authentication.fixture";
import { closeApiRedisConnection, ownApiTestExecutor, resetApiRedisTestDatabase } from "../support/fixture-lifecycle";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";

let pg: Awaited<ReturnType<typeof createApiPostgresTestHarness>>;
beforeAll(async () => {
  pg = await createApiPostgresTestHarness();
});
beforeEach(async () => await pg.reset());
afterEach(resetApiRedisTestDatabase);
afterAll(async () => {
  await pg?.close();
});

function unused(): never {
  throw new Error("Unused mobile-binding test dependency");
}

test("a failed mobile write leaves the code spent and keeps the sending cooldown", async () => {
  const [user] = await pg.db
    .insert(users)
    .values({ username: "holder", name: "Holder", mobile: "13800000000" })
    .returning();
  if (!user) throw new Error("User fixture was not inserted");
  const consumed = Promise.withResolvers<void>();
  const continueWrite = Promise.withResolvers<void>();
  const phone = "13900000000";
  const { mobileService, closeRedis } = createSmsFixture("1234");
  const repositories = createApiRepositories(pg.db);
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
  const repositories = createApiRepositories(pg.db);
  const auditLogWriter = createAuditLogWriter({ sourceApp: "iam", auditRepository: repositories.audit });
  const uow = createApiUnitOfWork({
    db: pg.db,
    logger: { warn() {}, error() {} },
    clock: { nowDate: () => new Date("2026-10-26T12:00:00Z") },
    userDocumentJobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length, jobIds: [] };
      },
    },
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries(entries) {
        return { enqueued: entries.length };
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
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 });
  const closeRedis = ownApiTestExecutor(() => closeApiRedisConnection(redis));
  const sentTo: string[] = [];
  const mobileService = createMobileService({
    cooldown: createMobileCodeCooldown(redis),
    redis,
    smsSender: {
      async sendVerificationCode(phoneNumber) {
        sentTo.push(phoneNumber);
        return { success: true, code };
      },
      sendMessage: unused,
    },
    userRepository: createApiRepositories(pg.db).user,
    config: { verificationCodeTtlSeconds: 180 },
  });
  return { mobileService, closeRedis, sentTo };
}

test("concurrent self-binding requests write the trimmed mobile only once", async () => {
  const phone = "13900000001";
  const code = "1234";
  const { mobileService, closeRedis, sentTo } = createSmsFixture(code);
  try {
    const bothReady = Promise.withResolvers<void>();
    let submissions = 0;
    const f = await createRootAuthenticationFixture(undefined, undefined, undefined, undefined, undefined, undefined, {
      publicUser: makeUserService({
        ...mobileService,
        async consumeVerificationCode(...args) {
          if (++submissions === 2) bothReady.resolve();
          await bothReady.promise;
          return mobileService.consumeVerificationCode(...args);
        },
      }),
    });
    try {
      await pg.db.insert(users).values([
        { username: "self", name: "Self", subjectIdentifier: f.subjectIdentifier },
        { username: "owner", name: "Owner", mobile: phone, status: UserStatus.Disable },
      ]);
      const root = await f.login();
      const bind = (phoneNumber: string) =>
        f.app.request("/public/mobile/set", {
          method: "POST",
          headers: { Client: "iam", "Content-Type": "application/json", Authorization: root },
          body: JSON.stringify({ phoneNumber, code }),
        });

      const invalid = await bind(" \t ");
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({ code: ApiErrorCode.InvalidMobile });
      const occupied = await bind(` ${phone}`);
      expect(occupied.status).toBe(409);
      expect(await occupied.json()).toMatchObject({ code: ApiErrorCode.MobileAlreadyExists });

      await pg.db.update(users).set({ isDelete: true }).where(eq(users.username, "owner"));
      await mobileService.sendCode(` ${phone}\t`, VerificationCodeUsage.BindPhone);
      expect(sentTo).toEqual([phone]);
      const responses = await Promise.all([bind(`\t${phone} `), bind(phone)]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
      const rejected = responses.find(({ status }) => status === 400);
      expect(await rejected?.json()).toMatchObject({ code: ApiErrorCode.InvalidVerificationCode });
      expect(await mobileService.checkVerificationCode(VerificationCodeUsage.BindPhone, phone, code)).toBe(false);
      expect(await pg.db.select().from(users).orderBy(users.id)).toMatchObject([
        { username: "self", mobile: phone, isDelete: false },
        { username: "owner", mobile: phone, isDelete: true },
      ]);
      expect(await pg.db.select().from(userDocumentOutboxEntries)).toHaveLength(1);
    } finally {
      await f.close();
    }
  } finally {
    await closeRedis();
  }
});
