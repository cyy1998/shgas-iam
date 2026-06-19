import type { UserCreateDto, UserQueryDto } from "@api/services/user/user.type";
import type { DbClient } from "@iam/db";
import { EmploymentStatus, PositionStatus, RoleStatus, UserStatus } from "@iam/contracts";
import { firstRow, inArrayIf } from "@iam/db/query-utils";
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
} from "@iam/db/schema";
import { and, eq, exists, gt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
    async searchUsers(query: UserQueryDto) {
      return await db.select().from(users).where(and(
        inArrayIf(users.username, query.usernames),
        inArrayIf(users.mobile, query.phones),
        inArrayIf(users.wxId, query.wxIds),
        userSearchEmploymentExists(query, db),
        eq(users.status, UserStatus.Enable),
        eq(users.isDelete, false),
      ));
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

function activeRoleCondition(roleCodes: string[] | undefined) {
  return and(
    eq(roles.status, RoleStatus.Enable),
    eq(roles.isDelete, false),
    inArrayIf(roles.roleCode, roleCodes),
  );
}

function employmentHasRoleCondition(employmentTable: any, roleCodes: string[] | undefined, tx: DbClient) {
  const closure = alias(organizationClosures, "user_role_org_closure");
  return or(
    exists(
      tx.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(roles, eq(positionRoles.roleId, roles.id))
        .where(and(
          eq(positionRoles.positionId, employmentTable.posId),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      tx.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(roles, eq(employmentRoles.roleId, roles.id))
        .where(and(
          eq(employmentRoles.employmentId, employmentTable.id),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      tx.select({ value: sql`1` })
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

function userSearchEmploymentExists(query: UserQueryDto, tx: DbClient) {
  const employment = alias(employments, "user_search_employment");
  const ancestor = alias(organizations, "user_search_ancestor");
  return exists(
    tx.select({ value: sql`1` })
      .from(employment)
      .where(and(
        eq(employment.userId, users.id),
        eq(employment.status, EmploymentStatus.Enable),
        eq(employment.isDelete, false),
        exists(
          tx.select({ value: sql`1` })
            .from(organizationClosures)
            .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
            .where(and(
              eq(organizationClosures.descendantId, employment.orgId),
              inArrayIf(ancestor.orgCode, query.ancestorOrgCodes),
              inArrayIf(organizationClosures.depth, query.ancestorOrgDepths),
            )),
        ),
        exists(
          tx.select({ value: sql`1` })
            .from(positions)
            .where(and(
              eq(positions.id, employment.posId),
              eq(positions.status, PositionStatus.Enable),
              eq(positions.isDelete, false),
              inArrayIf(positions.posCode, query.positionCodes),
            )),
        ),
        employmentHasRoleCondition(employment, query.roleCodes, tx),
      )),
  );
}
