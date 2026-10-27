import { afterAll, beforeAll, expect, test } from "bun:test";
import { createApiRepositories } from "@api/composition/repositories";
import { createApiUnitOfWork } from "@api/composition/tx";
import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import type { MobileVerificationCodeReservation } from "@api/services/mobile/mobile.type";
import { createUserService } from "@api/services/user/user.service";
import { createUserMobileBinding } from "@api/services/user/user-mobile-binding.helper";
import { mapUnitOfWork } from "@iam/api-core/uow";
import { UserStatus } from "@iam/contracts";
import { auditLogs, userDocumentOutboxEntries, users } from "@iam/db/schema";
import { UserNotFoundError } from "@iam/domain/user";
import { createApiPostgresTestHarness } from "../support/postgres-test-harness";

let pg: Awaited<ReturnType<typeof createApiPostgresTestHarness>>;
beforeAll(async () => {
  pg = await createApiPostgresTestHarness();
});
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
  const service = createUserService({
    userRepository: repositories.user,
    documentQuery: { getLoginProfileByUserId: unused, getMobileByUsername: unused },
    mobileBinding: createUserMobileBinding({
      auditLogWriter,
      mobileService: {
        checkValidPhoneNumber: () => true,
        checkExistingPhoneNumber: async () => false,
        async reserveVerificationCode() {
          reserved.resolve();
          await release.promise;
          return reservation;
        },
      },
    }),
    mobileService: {
      async confirmReservedVerificationCode() {
        confirmed = true;
        return true;
      },
      async releaseReservedVerificationCode(value) {
        returnedReservation = value;
      },
    },
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
