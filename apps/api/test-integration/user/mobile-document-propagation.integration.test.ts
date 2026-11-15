import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import process from "node:process";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { createMobileService } from "@api/services/mobile/mobile.service";
import type { MobileVerificationCodeReservation } from "@api/services/mobile/mobile.type";
import { createMobileCodeCooldown } from "@api/services/mobile/mobile-code-cooldown";
import { createUserService } from "@api/services/user/user.service";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { ApiErrorCode, UserStatus } from "@iam/contracts";
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

test("a mobile binding that updates no account releases its reservation without recording document work", async () => {
  const [user] = await pg.db
    .insert(users)
    .values({ username: "holder", name: "Holder", mobile: "13800000000" })
    .returning();
  if (!user) throw new Error("User fixture was not inserted");
  const reserved = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const reservation = { usage: "bind-phone", phone: "13900000000", token: "synthetic-reservation" };
  let confirmed = false;
  let returnedReservation: MobileVerificationCodeReservation | undefined;
  const repositories = createApiRepositories(pg.db);
  const service = makeUserService({
    checkValidPhoneNumber: () => true,
    async reserveVerificationCode() {
      reserved.resolve();
      await release.promise;
      return reservation;
    },
    async confirmReservedVerificationCode() {
      confirmed = true;
      return true;
    },
    async releaseReservedVerificationCode(value) {
      returnedReservation = value;
    },
  });
  const pending = service.setMobile(user.id, reservation.phone, "1234");
  let result: unknown;
  try {
    await Promise.race([reserved.promise, pending]);
    const paused = await repositories.user.updateEnabledUserStatus(user.id, UserStatus.Pause);
    expect(paused?.status).toBe(UserStatus.Pause);
    release.resolve();
    try {
      result = await pending;
    } catch (error) {
      result = error;
    }
    expect(result).toBeInstanceOf(UserNotFoundError);
    const account = await pg.db.query.users.findFirst({ where: { id: user.id } });
    const audits = await pg.db.select().from(auditLogs);
    const work = await pg.db.select().from(userDocumentOutboxEntries);
    expect(account?.mobile).toBe("13800000000");
    expect(audits).toEqual([]);
    expect(work).toEqual([]);
    expect(confirmed).toBe(false);
    expect(returnedReservation).toEqual(reservation);
  } finally {
    release.resolve();
    await Promise.allSettled([pending]);
  }
});

type MobileBindingService = Pick<
  ReturnType<typeof createMobileService>,
  | "checkValidPhoneNumber"
  | "reserveVerificationCode"
  | "confirmReservedVerificationCode"
  | "releaseReservedVerificationCode"
>;

function makeUserService(mobileService: MobileBindingService) {
  const repositories = createApiRepositories(pg.db);
  const auditLogWriter = createApiAuditLogWriter({ auditRepository: repositories.audit });
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
    mobileService,
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

test("self-binding verifies and stores the trimmed mobile with PostgreSQL and Redis", async () => {
  const phone = "13900000001";
  const code = "1234";
  const redisUrl = process.env.IAM_API_TEST_REDIS_URL;
  if (!redisUrl) throw new Error("IAM_API_TEST_REDIS_URL is required");
  const redis = new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 0 });
  const closeRedis = ownApiTestExecutor(() => closeApiRedisConnection(redis));
  try {
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
      config: { verificationCodeTtlSeconds: 60 },
    });
    const f = await createRootAuthenticationFixture(undefined, undefined, undefined, undefined, undefined, undefined, {
      publicUser: makeUserService(mobileService),
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
      const success = await bind(`\t${phone} `);
      expect(success.status).toBe(200);
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
