import type { UserCreateDto } from "@api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { UserStatus } from "@iam/contracts";
import { firstRow } from "@iam/db/query-utils";
import { users } from "@iam/db/schema";
import { and, eq, sql } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    async lockUserByUsername(username: string) {
      return firstRow(await db.select({ id: users.id }).from(users).where(and(
        eq(users.username, username),
        eq(users.status, UserStatus.Enable),
        eq(users.isDelete, false),
      )).for("update")) ?? null;
    },
    async lockUserById(id: number) {
      return firstRow(await db.select({ id: users.id }).from(users).where(and(
        eq(users.id, id),
        eq(users.isDelete, false),
      )).for("update")) ?? null;
    },
    async lockPurveyorContactMobile(mobile: string) {
      await db.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(${`iam:purveyor-contact:${mobile}`}, 0::bigint)
        )
      `);
    },
    async getUserById(userId: number) {
      return await db.query.users.findFirst({
        where: {
          id: userId,
          status: UserStatus.Enable,
          isDelete: false,
        },
      }) ?? null;
    },
    async getUserBySubjectIdentifier(subjectIdentifier: string) {
      return await db.query.users.findFirst({
        where: {
          subjectIdentifier,
          status: UserStatus.Enable,
          isDelete: false,
        },
      }) ?? null;
    },
    async getUserByUsername(username: string) {
      return await db.query.users.findFirst({
        where: {
          username,
          status: UserStatus.Enable,
          isDelete: false,
        },
      }) ?? null;
    },
    async getUserByWxId(wxId: string) {
      return await db.query.users.findFirst({
        where: {
          wxId,
          status: UserStatus.Enable,
          isDelete: false,
        },
      }) ?? null;
    },
    async getUserByMobile(mobile: string) {
      return await db.query.users.findFirst({
        where: {
          mobile,
          status: UserStatus.Enable,
          isDelete: false,
        },
      }) ?? null;
    },
    async setPassword(userId: number, password: string) {
      return firstRow(await db
        .update(users)
        .set({ password })
        .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
        .returning())!;
    },
    async setMobile(userId: number, phoneNumber: string) {
      return firstRow(await db
        .update(users)
        .set({ mobile: phoneNumber })
        .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
        .returning())!;
    },
    async updateEnabledUserStatus(userId: number, status: UserStatus) {
      return firstRow(await db
        .update(users)
        .set({ status })
        .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
        .returning()) ?? null;
    },
    async setUser(userCreateDto: UserCreateDto & { subjectIdentifier: string }) {
      return firstRow(await db.insert(users).values(userCreateDto).returning())!;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
