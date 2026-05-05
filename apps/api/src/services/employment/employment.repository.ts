import type { DbClient } from "@api/db";
import type { Employment, Organization, User } from "@api/db/schema";
import type { EmploymentAdminPaginationQueryDto, EmploymentQueryDto } from "./employment.type";
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
  posOrgCompositions,
  posOrgRoles,
  privileges,
  rolePrivileges,
  roles,
  users,
} from "@api/db/schema";
import { Status } from "@api/enums/status";
import { and, count, desc, eq, exists, getTableColumns, gt, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type Position = typeof positions.$inferSelect;
type EmploymentWithRelations = Employment & {
  user: User;
  deptartment: Organization;
  company: Organization;
  position: Position;
};

async function attachEmploymentRelations(rows: Employment[], tx: DbClient): Promise<EmploymentWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }

  const userIds = [...new Set(rows.map(row => row.userId))];
  const orgIds = [...new Set(rows.flatMap(row => [row.orgId, row.compId]))];
  const posIds = [...new Set(rows.map(row => row.posId))];

  const [userRows, orgRows, posRows] = await Promise.all([
    tx.select().from(users).where(inArray(users.id, userIds)),
    tx.select().from(organizations).where(inArray(organizations.id, orgIds)),
    tx.select().from(positions).where(inArray(positions.id, posIds)),
  ]);

  const userMap = new Map(userRows.map(user => [user.id, user]));
  const orgMap = new Map(orgRows.map(org => [org.id, org]));
  const posMap = new Map(posRows.map(pos => [pos.id, pos]));

  return rows
    .map(row => ({
      ...row,
      user: userMap.get(row.userId),
      deptartment: orgMap.get(row.orgId),
      company: orgMap.get(row.compId),
      position: posMap.get(row.posId),
    }))
    .filter((row): row is EmploymentWithRelations =>
      row.user !== undefined
      && row.deptartment !== undefined
      && row.company !== undefined
      && row.position !== undefined,
    );
}

function activeRoleCondition(roleCodes: string[] | undefined) {
  return and(
    eq(roles.status, Status.Enable),
    eq(roles.isDelete, false),
    inArrayIf(roles.roleCode, roleCodes),
  );
}

function employmentHasRoleCondition(roleCodes: string[] | undefined) {
  const ancestorClosure = alias(organizationClosures, "role_org_closure");
  return or(
    exists(
      db.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(roles, eq(positionRoles.roleId, roles.id))
        .where(and(
          eq(positionRoles.positionId, employments.posId),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(roles, eq(employmentRoles.roleId, roles.id))
        .where(and(
          eq(employmentRoles.employmentId, employments.id),
          activeRoleCondition(roleCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(ancestorClosure)
        .innerJoin(organizationRoles, eq(organizationRoles.organizationId, ancestorClosure.ancestorId))
        .innerJoin(roles, eq(organizationRoles.roleId, roles.id))
        .where(and(
          eq(ancestorClosure.descendantId, employments.orgId),
          or(
            and(eq(ancestorClosure.depth, 0), activeRoleCondition(roleCodes)),
            and(gt(ancestorClosure.depth, 0), eq(organizationRoles.isAllSub, true), activeRoleCondition(roleCodes)),
          ),
        )),
    ),
  );
}

function employmentSearchWhere(employmentQueryDto: EmploymentQueryDto) {
  const ancestor = alias(organizations, "employment_ancestor_filter");
  return and(
    exists(
      db.select({ value: sql`1` })
        .from(users)
        .where(and(
          eq(users.id, employments.userId),
          inArrayIf(users.username, employmentQueryDto.usernames),
          inArrayIf(users.mobile, employmentQueryDto.phones),
          inArrayIf(users.wxId, employmentQueryDto.wxIds),
          eq(users.status, Status.Enable),
          eq(users.isDelete, false),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(organizationClosures)
        .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
        .where(and(
          eq(organizationClosures.descendantId, employments.orgId),
          inArrayIf(ancestor.orgCode, employmentQueryDto.ancestorOrgCodes),
          inArrayIf(organizationClosures.depth, employmentQueryDto.ancestorOrgDepths),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(positions)
        .where(and(
          eq(positions.id, employments.posId),
          eq(positions.status, Status.Enable),
          eq(positions.isDelete, false),
          inArrayIf(positions.posCode, employmentQueryDto.positionCodes),
        )),
    ),
    employmentHasRoleCondition(employmentQueryDto.roleCodes),
    eq(employments.status, Status.Enable),
    eq(employments.isDelete, false),
  );
}

function employmentHasPrivilegeCondition(privilegeCodes: string[]) {
  return or(
    exists(
      db.select({ value: sql`1` })
        .from(organizationRoles)
        .innerJoin(rolePrivileges, eq(organizationRoles.roleId, rolePrivileges.roleId))
        .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          eq(organizationRoles.organizationId, employments.orgId),
          inArrayIf(privileges.privilegeCode, privilegeCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(organizationRoles)
        .innerJoin(rolePrivileges, eq(organizationRoles.roleId, rolePrivileges.roleId))
        .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          eq(organizationRoles.organizationId, employments.compId),
          inArrayIf(privileges.privilegeCode, privilegeCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(positionRoles)
        .innerJoin(rolePrivileges, eq(positionRoles.roleId, rolePrivileges.roleId))
        .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          eq(positionRoles.positionId, employments.posId),
          inArrayIf(privileges.privilegeCode, privilegeCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(posOrgCompositions)
        .innerJoin(posOrgRoles, eq(posOrgRoles.posOrgId, posOrgCompositions.id))
        .innerJoin(rolePrivileges, eq(posOrgRoles.roleId, rolePrivileges.roleId))
        .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          eq(posOrgCompositions.posId, employments.posId),
          eq(posOrgCompositions.orgId, employments.orgId),
          inArrayIf(privileges.privilegeCode, privilegeCodes),
        )),
    ),
    exists(
      db.select({ value: sql`1` })
        .from(employmentRoles)
        .innerJoin(rolePrivileges, eq(employmentRoles.roleId, rolePrivileges.roleId))
        .innerJoin(privileges, eq(rolePrivileges.privilegeId, privileges.id))
        .where(and(
          eq(employmentRoles.employmentId, employments.id),
          inArrayIf(privileges.privilegeCode, privilegeCodes),
        )),
    ),
  );
}

export async function getEmploymentsByUserId(userId: number, tx: DbClient = db) {
  const rows = await tx.select().from(employments).where(and(
    eq(employments.userId, userId),
    eq(employments.status, Status.Enable),
    eq(employments.isDelete, false),
  ));
  return await attachEmploymentRelations(rows, tx);
}

export async function getEmploymentsByUsername(username: string, tx: DbClient = db) {
  const rows = await tx
    .select({ ...getTableColumns(employments) })
    .from(employments)
    .innerJoin(users, eq(employments.userId, users.id))
    .where(and(
      eq(users.username, username),
      eq(employments.status, Status.Enable),
      eq(employments.isDelete, false),
    ));
  return await attachEmploymentRelations(rows, tx);
}

export async function getEmploymentByUserOrgPosId(
  userId: number,
  orgId: number,
  posId: number,
  tx: DbClient = db,
) {
  const rows = await tx.select().from(employments).where(and(
    eq(employments.userId, userId),
    eq(employments.orgId, orgId),
    eq(employments.posId, posId),
    eq(employments.status, Status.Enable),
    eq(employments.isDelete, false),
  )).limit(1);
  return firstRow(await attachEmploymentRelations(rows, tx)) ?? null;
}

export async function getEmploymentByUserOrgPosCode(
  username: string,
  orgCode: string,
  posCode: string,
  tx: DbClient = db,
) {
  const rows = await tx
    .select({ ...getTableColumns(employments) })
    .from(employments)
    .innerJoin(users, eq(employments.userId, users.id))
    .innerJoin(organizations, eq(employments.orgId, organizations.id))
    .innerJoin(positions, eq(employments.posId, positions.id))
    .where(and(
      eq(users.username, username),
      eq(organizations.orgCode, orgCode),
      eq(positions.posCode, posCode),
      eq(employments.status, Status.Enable),
      eq(employments.isDelete, false),
    ))
    .limit(1);
  return firstRow(rows) ?? null;
}

export async function getEmploymentsByUserAndPrivilege(
  username: string,
  privCondition: string | string[],
  tx: DbClient = db,
) {
  const privilegeCodes = Array.isArray(privCondition) ? privCondition : [privCondition];
  const rows = await tx
    .select({ ...getTableColumns(employments) })
    .from(employments)
    .innerJoin(users, eq(employments.userId, users.id))
    .where(and(
      eq(users.username, username),
      eq(employments.status, Status.Enable),
      eq(employments.isDelete, false),
      employmentHasPrivilegeCondition(privilegeCodes),
    ));
  return await attachEmploymentRelations(rows, tx);
}

export async function setEmployment(
  userId: number,
  posId: number,
  orgId: number,
  compId: number,
  tx: DbClient = db,
) {
  return firstRow(await tx.insert(employments).values({
    userId,
    posId,
    orgId,
    compId,
  }).returning())!;
}

export async function searchEmployments(
  employmentQueryDto: EmploymentQueryDto,
  tx: DbClient = db,
) {
  const rows = await tx.select().from(employments).where(employmentSearchWhere(employmentQueryDto));
  return await attachEmploymentRelations(rows, tx);
}

export async function getEmploymentByIdForAdmin(
  id: number,
  tx: DbClient = db,
) {
  const rows = await tx.select().from(employments).where(and(
    eq(employments.id, id),
    eq(employments.isDelete, false),
  )).limit(1);
  return firstRow(await attachEmploymentRelations(rows, tx)) ?? null;
}

export async function getEmploymentsByUserIdForAdmin(
  userId: number,
  tx: DbClient = db,
) {
  const rows = await tx.select().from(employments).where(and(
    eq(employments.userId, userId),
    eq(employments.isDelete, false),
  ));
  return await attachEmploymentRelations(rows, tx);
}

function buildEmploymentAdminWhere(dto: EmploymentAdminPaginationQueryDto) {
  const text = dto.conditions.fuzzyConditions.text;
  return and(
    eq(employments.isDelete, false),
    inArrayIf(employments.status, dto.conditions.exactConditions.statuses),
    dto.conditions.exactConditions.isPrimary === undefined
      ? undefined
      : eq(employments.isPrimary, dto.conditions.exactConditions.isPrimary),
    exists(
      db.select({ value: sql`1` }).from(users).where(and(
        eq(users.id, employments.userId),
        eq(users.isDelete, false),
        inArrayIf(users.username, dto.conditions.exactConditions.usernames),
        text !== undefined
          ? or(ilikeContainsIf(users.username, text), ilikeContainsIf(users.name, text))
          : undefined,
      )),
    ),
    exists(
      db.select({ value: sql`1` }).from(organizations).where(and(
        eq(organizations.id, employments.compId),
        eq(organizations.isDelete, false),
        inArrayIf(organizations.orgCode, dto.conditions.exactConditions.companyOrgCodes),
      )),
    ),
    exists(
      db.select({ value: sql`1` }).from(organizations).where(and(
        eq(organizations.id, employments.orgId),
        eq(organizations.isDelete, false),
        inArrayIf(organizations.orgCode, dto.conditions.exactConditions.deptOrgCodes),
      )),
    ),
    exists(
      db.select({ value: sql`1` }).from(positions).where(and(
        eq(positions.id, employments.posId),
        eq(positions.isDelete, false),
        inArrayIf(positions.posCode, dto.conditions.exactConditions.posCodes),
      )),
    ),
  );
}

export async function searchEmploymentsFuzzyForAdminPaged(
  dto: EmploymentAdminPaginationQueryDto,
  tx: DbClient = db,
) {
  const { pageNum, pageSize } = dto;
  const where = buildEmploymentAdminWhere(dto);
  const [rows, totalRows] = await Promise.all([
    tx
      .select()
      .from(employments)
      .where(where)
      .orderBy(desc(employments.isPrimary), desc(employments.id))
      .limit(pageSize)
      .offset((pageNum - 1) * pageSize),
    tx.select({ value: count() }).from(employments).where(where),
  ]);
  return { rows: await attachEmploymentRelations(rows, tx), total: firstRow(totalRows)?.value ?? 0 };
}

export async function createEmploymentRecord(
  data: {
    userId: number;
    posId: number;
    orgId: number;
    compId: number;
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
    status?: number;
  },
  tx: DbClient = db,
) {
  return firstRow(await tx.insert(employments).values({
    userId: data.userId,
    posId: data.posId,
    orgId: data.orgId,
    compId: data.compId,
    isPrimary: data.isPrimary ?? false,
    startTime: data.startTime ?? new Date(),
    description: data.description ?? null,
    status: data.status ?? Status.Enable,
  }).returning())!;
}

export async function updateEmploymentRecord(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    endTime?: Date | null;
    description?: string | null;
    status?: number;
  },
  tx: DbClient = db,
) {
  return firstRow(await tx
    .update(employments)
    .set(compactUpdate(data))
    .where(eq(employments.id, id))
    .returning())!;
}

export async function unsetPrimariesByUserId(
  userId: number,
  exceptEmploymentId: number | null,
  tx: DbClient = db,
) {
  return await tx
    .update(employments)
    .set({ isPrimary: false })
    .where(and(
      eq(employments.userId, userId),
      eq(employments.isPrimary, true),
      eq(employments.isDelete, false),
      exceptEmploymentId === null ? undefined : sql`${employments.id} <> ${exceptEmploymentId}`,
    ));
}

export async function softDeleteEmployment(
  id: number,
  tx: DbClient = db,
) {
  return await tx
    .update(employments)
    .set({ isDelete: true })
    .where(eq(employments.id, id));
}

export async function endActiveEmploymentsByUserId(
  userId: number,
  tx: DbClient = db,
) {
  return await tx
    .update(employments)
    .set({
      status: Status.Disable,
      endTime: new Date(),
    })
    .where(and(
      eq(employments.userId, userId),
      eq(employments.isDelete, false),
      inArray(employments.status, [Status.Enable, Status.Pause]),
    ));
}
