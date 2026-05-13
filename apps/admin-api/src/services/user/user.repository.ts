import type { UserCreateDto, UserPaginationQueryDto } from "@admin-api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { Status } from "@iam/contracts";
import db from "@iam/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  users,
} from "@iam/db/schema";
import { and, count, eq, or } from "drizzle-orm";

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

export async function setPassword(userId: number, password: string, tx: DbClient = db) {
  return firstRow(await tx
    .update(users)
    .set({ password })
    .where(and(eq(users.id, userId), eq(users.status, Status.Enable), eq(users.isDelete, false)))
    .returning())!;
}

export async function getUserByUsernameForAdmin(
  username: string,
  tx: DbClient = db,
) {
  return await tx.query.users.findFirst({
    where: {
      username,
      isDelete: false,
    },
  }) ?? null;
}

export async function searchUsersFuzzyPaged(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: DbClient = db,
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

export async function updateUserByUsername(
  username: string,
  data: {
    name?: string;
    mobile?: string | null;
    wxId?: string | null;
    userType?: string;
    status?: number;
    orderNum?: number;
  },
  tx: DbClient = db,
) {
  return firstRow(await tx
    .update(users)
    .set(compactUpdate(data))
    .where(eq(users.username, username))
    .returning())!;
}

export async function softDeleteUserByUsername(
  username: string,
  tx: DbClient = db,
) {
  return firstRow(await tx
    .update(users)
    .set({ isDelete: true })
    .where(eq(users.username, username))
    .returning())!;
}

export async function countActiveEmploymentsByUsername(
  username: string,
  tx: DbClient = db,
) {
  const rows = await tx
    .select({ value: count() })
    .from(employments)
    .innerJoin(users, eq(employments.userId, users.id))
    .where(and(
      eq(employments.isDelete, false),
      eq(employments.status, Status.Enable),
      eq(users.username, username),
      eq(users.isDelete, false),
    ));
  return firstRow(rows)?.value ?? 0;
}

export async function setUserForAdmin(
  userCreateDto: UserCreateDto,
  tx: DbClient = db,
) {
  return firstRow(await tx.insert(users).values(userCreateDto).returning())!;
}
