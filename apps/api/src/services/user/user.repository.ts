import type { DbClient } from "@api/db";
import type { UserCreateDto, UserPaginationQueryDto, UserQueryDto } from "@api/services/user/user.type";
import type { Prettify } from "@api/utils/lint.util";
import db from "@api/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@api/db/query-utils";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  organizations,
  positionRoles,
  positions,
  roles,
  users,
} from "@api/db/schema";
import { Status } from "@api/enums/status";
import { and, count, eq, exists, gt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export async function getUserById(userId: number, tx: DbClient = db) {
  return await tx.query.users.findFirst({
    where: {
      id: userId,
      status: Status.Enable,
      isDelete: false,
    },
  }) ?? null;
}

export async function getUserByUsername(username: string, tx: DbClient = db) {
  return await tx.query.users.findFirst({
    where: {
      username,
      status: Status.Enable,
      isDelete: false,
    },
  }) ?? null;
}

export async function getUserByWxId(wxId: string, tx: DbClient = db) {
  return await tx.query.users.findFirst({
    where: {
      wxId,
      status: Status.Enable,
      isDelete: false,
    },
  }) ?? null;
}

export async function getUserByMobile(mobile: string, tx: DbClient = db) {
  return await tx.query.users.findFirst({
    where: {
      mobile,
      status: Status.Enable,
      isDelete: false,
    },
  }) ?? null;
}

function activeRoleCondition(roleCodes: string[] | undefined) {
  return and(
    eq(roles.status, Status.Enable),
    eq(roles.isDelete, false),
    inArrayIf(roles.roleCode, roleCodes),
  );
}

function employmentHasRoleCondition(employmentTable: any, roleCodes: string[] | undefined) {
  const closure = alias(organizationClosures, "user_role_org_closure");
  return or(
    exists(
      db.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(roles, eq(positionRoles.roleId, roles.id))
        .where(and(
          eq(positionRoles.positionId, employmentTable.posId),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(roles, eq(employmentRoles.roleId, roles.id))
        .where(and(
          eq(employmentRoles.employmentId, employmentTable.id),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(closure)
        .innerJoin(organizationRoles, eq(organizationRoles.organizationId, closure.ancestorId))
        .innerJoin(roles, eq(organizationRoles.roleId, roles.id))
        .where(and(
          eq(closure.descendantId, employmentTable.orgId),
          or(
            and(eq(closure.depth, 0), activeRoleCondition(roleCodes)),
            and(gt(closure.depth, 0), eq(organizationRoles.isAllSub, true), activeRoleCondition(roleCodes)),
          ),
        )),
    ),
  );
}

function userSearchEmploymentExists(query: UserQueryDto) {
  const employment = alias(employments, "user_search_employment");
  const ancestor = alias(organizations, "user_search_ancestor");
  return exists(
    db.select({ value: sql`1` })
      .from(employment)
      .where(and(
        eq(employment.userId, users.id),
        eq(employment.status, Status.Enable),
        eq(employment.isDelete, false),
        exists(
          db.select({ value: sql`1` })
            .from(organizationClosures)
            .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
            .where(and(
              eq(organizationClosures.descendantId, employment.orgId),
              inArrayIf(ancestor.orgCode, query.ancestorOrgCodes),
              inArrayIf(organizationClosures.depth, query.ancestorOrgDepths),
            )),
        ),
        exists(
          db.select({ value: sql`1` })
            .from(positions)
            .where(and(
              eq(positions.id, employment.posId),
              eq(positions.status, Status.Enable),
              eq(positions.isDelete, false),
              inArrayIf(positions.posCode, query.positionCodes),
            )),
        ),
        employmentHasRoleCondition(employment, query.roleCodes),
      )),
  );
}

export async function searchUsers(
  query: UserQueryDto,
  tx: DbClient = db,
) {
  return await tx.select().from(users).where(and(
    inArrayIf(users.username, query.usernames),
    inArrayIf(users.mobile, query.phones),
    inArrayIf(users.wxId, query.wxIds),
    userSearchEmploymentExists(query),
    eq(users.status, Status.Enable),
    eq(users.isDelete, false),
  ));
}

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

export async function searchUsersFuzzy(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: DbClient = db,
) {
  return await tx.select().from(users).where(usersFuzzyWhere(userPaginationQueryDto));
}

export async function setPassword(userId: number, password: string, tx: DbClient = db) {
  return firstRow(await tx
    .update(users)
    .set({ password })
    .where(and(eq(users.id, userId), eq(users.status, Status.Enable), eq(users.isDelete, false)))
    .returning())!;
}

export async function setMobile(userId: number, phoneNumber: string, tx: DbClient = db) {
  return firstRow(await tx
    .update(users)
    .set({ mobile: phoneNumber })
    .where(and(eq(users.id, userId), eq(users.status, Status.Enable), eq(users.isDelete, false)))
    .returning())!;
}

export async function setUser(userCreateDto: UserCreateDto, tx: DbClient = db) {
  return firstRow(await tx.insert(users).values(userCreateDto).returning())!;
}

export async function setUsers(
  userCreateDtos: Prettify<UserCreateDto>[],
  tx: DbClient = db,
) {
  if (userCreateDtos.length === 0) {
    return { count: 0 };
  }
  await tx.insert(users).values(userCreateDtos);
  return { count: userCreateDtos.length };
}

export async function getOtherUsersByOrgAndAllSub(userId: number, orgCode: string, tx: DbClient = db) {
  const employment = alias(employments, "other_user_employment");
  const ancestor = alias(organizations, "other_user_ancestor");
  return await tx.select().from(users).where(and(
    exists(
      db.select({ value: sql`1` })
        .from(employment)
        .innerJoin(organizationClosures, eq(organizationClosures.descendantId, employment.orgId))
        .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
        .where(and(
          eq(employment.userId, users.id),
          eq(ancestor.orgCode, orgCode),
        )),
    ),
    sql`${users.id} <> ${userId}`,
    eq(users.status, Status.Enable),
    eq(users.isDelete, false),
  ));
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

export async function countUsersFuzzy(
  userPaginationQueryDto: UserPaginationQueryDto,
  tx: DbClient = db,
) {
  const rows = await tx.select({ value: count() }).from(users).where(usersFuzzyWhere(userPaginationQueryDto));
  return firstRow(rows)?.value ?? 0;
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
