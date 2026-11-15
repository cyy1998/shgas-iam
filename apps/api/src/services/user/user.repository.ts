import type { UserCreateDto } from "@api/services/user/user.type";
import { UserStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { firstRow } from "@iam/db/query-utils";
import { USER_MOBILE_UNIQUE_INDEX, USER_WX_ID_UNIQUE_INDEX, users } from "@iam/db/schema";
import { MobileAlreadyExistsError, normalizeRegisteredIdentifier, UsernameAlreadyExistsError } from "@iam/domain/user";
import { and, eq, isNull, sql } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    async isMobileRegistered(mobile: string) {
      return (
        (await db.query.users.findFirst({
          columns: { id: true },
          where: { mobile, isDelete: false },
        })) !== undefined
      );
    },
    async lockUserByUsername(username: string) {
      return (
        firstRow(
          await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.username, username), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
            .for("update"),
        ) ?? null
      );
    },
    async lockUserById(id: number) {
      return (
        firstRow(
          await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, id), eq(users.isDelete, false)))
            .for("update"),
        ) ?? null
      );
    },
    async lockPurveyorContactMobile(mobile: string) {
      await db.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`iam:purveyor-contact:${mobile}`}, 0::bigint)
        )
      `);
    },
    async getUserById(userId: number) {
      return (
        (await db.query.users.findFirst({
          where: {
            id: userId,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async getUserBySubjectIdentifier(subjectIdentifier: string) {
      return (
        (await db.query.users.findFirst({
          where: {
            subjectIdentifier,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async getUserByUsername(username: string) {
      return (
        (await db.query.users.findFirst({
          where: {
            username,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async findUserIdentityByUsername(username: string) {
      return (
        (await db.query.users.findFirst({
          columns: { id: true },
          where: { username, isDelete: false },
        })) ?? null
      );
    },
    async findRegisteredWechatMember(wxId: string) {
      const user = await db.query.users.findFirst({
        columns: { id: true, subjectIdentifier: true },
        where: { wxId, isDelete: false },
      });
      return user ? { userId: user.id, subjectIdentifier: user.subjectIdentifier } : null;
    },
    async getUserByWxId(wxId: string) {
      const registeredWxId = normalizeRegisteredIdentifier(wxId);
      if (registeredWxId === null) return null;
      return (
        (await db.query.users.findFirst({
          where: {
            wxId: registeredWxId,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async getUserByMobile(mobile: string) {
      const registeredMobile = normalizeRegisteredIdentifier(mobile);
      if (registeredMobile === null) return null;
      return (
        (await db.query.users.findFirst({
          where: {
            mobile: registeredMobile,
            status: UserStatus.Enable,
            isDelete: false,
          },
        })) ?? null
      );
    },
    async setPassword(userId: number, password: string) {
      return firstRow(
        await db
          .update(users)
          .set({ password })
          .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
          .returning(),
      )!;
    },
    async setFirstWechatBinding(userId: number, wxId: string) {
      try {
        const updated = await db
          .update(users)
          .set({ wxId })
          .where(
            and(
              eq(users.id, userId),
              eq(users.status, UserStatus.Enable),
              eq(users.isDelete, false),
              isNull(users.wxId),
            ),
          )
          .returning({ id: users.id });
        if (updated.length !== 1) throw new Error("WeCom binding user changed under lock");
        return "bound" as const;
      } catch (error) {
        const detail = extractPostgresError(error);
        if (detail?.code === "23505" && detail.constraint === USER_WX_ID_UNIQUE_INDEX) return "conflict" as const;
        throw error;
      }
    },
    async setMobile(userId: number, phoneNumber: string) {
      try {
        return firstRow(
          await db
            .update(users)
            .set({ mobile: phoneNumber })
            .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
            .returning(),
        );
      } catch (error) {
        const detail = extractPostgresError(error);
        if (detail?.code === "23505" && detail.constraint === USER_MOBILE_UNIQUE_INDEX) {
          throw new MobileAlreadyExistsError();
        }
        throw error;
      }
    },
    async updateEnabledUserStatus(userId: number, status: UserStatus) {
      return (
        firstRow(
          await db
            .update(users)
            .set({ status })
            .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
            .returning(),
        ) ?? null
      );
    },
    async setUser(userCreateDto: UserCreateDto & { subjectIdentifier: string }) {
      try {
        return firstRow(await db.insert(users).values(userCreateDto).returning())!;
      } catch (error) {
        const detail = extractPostgresError(error);
        if (
          detail?.code === "23505" &&
          (detail.constraint === "user_username_key" || detail.constraint === "user_username_unique")
        ) {
          throw new UsernameAlreadyExistsError();
        }
        if (detail?.code === "23505" && detail.constraint === USER_MOBILE_UNIQUE_INDEX) {
          throw new MobileAlreadyExistsError();
        }
        throw error;
      }
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
