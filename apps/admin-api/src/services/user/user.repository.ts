import type { UserCreateDto, UserPaginationQueryDto, UserUpdateDto } from "@admin-api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  users,
} from "@iam/db/schema";
import { and, count, eq, inArray, or } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    async getSessionManagementUserSummaries(userIds: readonly number[]) {
      if (userIds.length === 0)
        return [];
      return await db
        .select({
          id: users.id,
          subjectIdentifier: users.subjectIdentifier,
          username: users.username,
          name: users.name,
          status: users.status,
          isDelete: users.isDelete,
        })
        .from(users)
        .where(inArray(users.id, [...userIds]));
    },
    async getSessionManagementUserSummariesBySubjectIdentifiers(
      subjectIdentifiers: readonly string[],
    ) {
      if (subjectIdentifiers.length === 0)
        return [];
      return await db
        .select({
          id: users.id,
          subjectIdentifier: users.subjectIdentifier,
          username: users.username,
          name: users.name,
          status: users.status,
          isDelete: users.isDelete,
        })
        .from(users)
        .where(inArray(users.subjectIdentifier, [...subjectIdentifiers]));
    },
    async setPassword(userId: number, password: string) {
      return firstRow(await db
        .update(users)
        .set({ password })
        .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
        .returning())!;
    },
    async getUserByUsernameForAdmin(username: string) {
      return await db.query.users.findFirst({
        where: {
          username,
          isDelete: false,
        },
      }) ?? null;
    },
    async getUserBySubjectIdentifierForAdmin(subjectIdentifier: string) {
      return await db.query.users.findFirst({
        where: {
          subjectIdentifier,
          isDelete: false,
        },
      }) ?? null;
    },
    async searchUsersFuzzyPaged(userPaginationQueryDto: UserPaginationQueryDto) {
      const { pageNum, pageSize } = userPaginationQueryDto;
      const where = usersFuzzyWhere(userPaginationQueryDto);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(users)
          .where(where)
          .orderBy(users.orderNum, users.id)
          .limit(pageSize)
          .offset((pageNum - 1) * pageSize),
        db.select({ value: count() }).from(users).where(where),
      ]);
      return { rows, total: firstRow(totalRows)?.value ?? 0 };
    },
    async updateUserByUsername(username: string, data: UserUpdateDto) {
      return firstRow(await db
        .update(users)
        .set(compactUpdate(data))
        .where(eq(users.username, username))
        .returning())!;
    },
    async softDeleteUserByUsername(username: string) {
      return firstRow(await db
        .update(users)
        .set({ isDelete: true })
        .where(eq(users.username, username))
        .returning())!;
    },
    async countActiveEmploymentsByUsername(username: string) {
      const rows = await db
        .select({ value: count() })
        .from(employments)
        .innerJoin(users, eq(employments.userId, users.id))
        .where(and(
          eq(employments.isDelete, false),
          eq(employments.status, EmploymentStatus.Enable),
          eq(users.username, username),
          eq(users.isDelete, false),
        ));
      return firstRow(rows)?.value ?? 0;
    },
    async setUserForAdmin(userCreateDto: UserCreateDto & { subjectIdentifier: string }) {
      return firstRow(await db.insert(users).values(userCreateDto).returning())!;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;

function usersFuzzyWhere(userPaginationQueryDto: UserPaginationQueryDto) {
  const text = userPaginationQueryDto.conditions.fuzzyConditions.text;
  return and(
    text !== undefined
      ? or(
          ilikeContainsIf(users.username, text),
          ilikeContainsIf(users.name, text),
          ilikeContainsIf(users.mobile, text),
          ilikeContainsIf(users.wxId, text),
        )
      : undefined,
    inArrayIf(users.userType, userPaginationQueryDto.conditions.exactConditions.userTypes),
    inArrayIf(users.username, userPaginationQueryDto.conditions.exactConditions.usernames),
    inArrayIf(users.mobile, userPaginationQueryDto.conditions.exactConditions.phones),
    inArrayIf(users.wxId, userPaginationQueryDto.conditions.exactConditions.wxIds),
    inArrayIf(users.status, userPaginationQueryDto.conditions.exactConditions.statuses),
    eq(users.isDelete, false),
  );
}
