import type { UserCreateDto, UserPaginationQueryDto, UserUpdateDto } from "@admin-api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  users,
} from "@iam/db/schema";
import { and, count, eq, or } from "drizzle-orm";

export function createUserRepository(db: DbClient) {
  return {
    setPassword(userId: number, password: string) {
      return setPassword(userId, password, db);
    },
    getUserByUsernameForAdmin(username: string) {
      return getUserByUsernameForAdmin(username, db);
    },
    searchUsersFuzzyPaged(userPaginationQueryDto: UserPaginationQueryDto) {
      return searchUsersFuzzyPaged(userPaginationQueryDto, db);
    },
    updateUserByUsername(username: string, data: UserUpdateDto) {
      return updateUserByUsername(username, data, db);
    },
    softDeleteUserByUsername(username: string) {
      return softDeleteUserByUsername(username, db);
    },
    countActiveEmploymentsByUsername(username: string) {
      return countActiveEmploymentsByUsername(username, db);
    },
    setUserForAdmin(userCreateDto: UserCreateDto) {
      return setUserForAdmin(userCreateDto, db);
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

async function setPassword(userId: number, password: string, tx: DbClient) {
  return firstRow(await tx
    .update(users)
    .set({ password })
    .where(and(eq(users.id, userId), eq(users.status, UserStatus.Enable), eq(users.isDelete, false)))
    .returning())!;
}

async function getUserByUsernameForAdmin(
  username: string,
  tx: DbClient,
) {
  return await tx.query.users.findFirst({
    where: {
      username,
      isDelete: false,
    },
  }) ?? null;
}

async function searchUsersFuzzyPaged(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: DbClient,
) {
  const { pageNum, pageSize } = userPaginationQueryDto;
  const where = usersFuzzyWhere(userPaginationQueryDto);
  const [rows, totalRows] = await Promise.all([
    tx
      .select()
      .from(users)
      .where(where)
      .orderBy(users.orderNum, users.id)
      .limit(pageSize)
      .offset((pageNum - 1) * pageSize),
    tx.select({ value: count() }).from(users).where(where),
  ]);
  return { rows, total: firstRow(totalRows)?.value ?? 0 };
}

async function updateUserByUsername(
  username: string,
  data: UserUpdateDto,
  tx: DbClient,
) {
  return firstRow(await tx
    .update(users)
    .set(compactUpdate(data))
    .where(eq(users.username, username))
    .returning())!;
}

async function softDeleteUserByUsername(
  username: string,
  tx: DbClient,
) {
  return firstRow(await tx
    .update(users)
    .set({ isDelete: true })
    .where(eq(users.username, username))
    .returning())!;
}

async function countActiveEmploymentsByUsername(
  username: string,
  tx: DbClient,
) {
  const rows = await tx
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
}

async function setUserForAdmin(
  userCreateDto: UserCreateDto,
  tx: DbClient,
) {
  return firstRow(await tx.insert(users).values(userCreateDto).returning())!;
}
