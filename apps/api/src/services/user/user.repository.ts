import type { UserCreateDto } from "@api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { UserStatus } from "@iam/contracts";
import { firstRow } from "@iam/db/query-utils";
import { users } from "@iam/db/schema";
import { and, eq } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    async getUserById(userId: number) {
      return await db.query.users.findFirst({
        where: {
          id: userId,
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
    async setUser(userCreateDto: UserCreateDto) {
      return firstRow(await db.insert(users).values(userCreateDto).returning())!;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;
