import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import type { EmploymentAdminPaginationQueryDto } from "./employment.type";
import { Status } from "@iam/contracts";
import db from "@iam/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { and, count, desc, eq, exists, inArray, or, sql } from "drizzle-orm";

type Position = typeof positions.$inferSelect;
type EmploymentWithRelations = Employment & {
  user: User;
  deptartment: Organization;
  company: Organization;
  position: Position;
};

const employmentRelations = {
  user: true,
  deptartment: true,
  company: true,
  position: true,
} as const;

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

export async function getEmploymentsByUserId(userId: number, tx: DbClient = db) {
  return await tx.query.employments.findMany({
    where: {
      userId,
      status: Status.Enable,
      isDelete: false,
    },
    with: employmentRelations,
  });
}

export async function getEmploymentByUserOrgPosId(
  userId: number,
  orgId: number,
  posId: number,
  tx: DbClient = db,
) {
  return await tx.query.employments.findFirst({
    where: {
      userId,
      orgId,
      posId,
      status: Status.Enable,
      isDelete: false,
    },
    with: employmentRelations,
  }) ?? null;
}

export async function getEmploymentByIdForAdmin(
  id: number,
  tx: DbClient = db,
) {
  return await tx.query.employments.findFirst({
    where: {
      id,
      isDelete: false,
    },
    with: employmentRelations,
  }) ?? null;
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
