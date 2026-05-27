import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import type { SQLWrapper } from "drizzle-orm";
import type { EmploymentAdminPaginationQueryDto } from "./employment.type";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";
import db from "@iam/db";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { and, count, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type Position = typeof positions.$inferSelect;
type EmploymentWithRelations = Employment & {
  user: User;
  organization: {
    assignedOrg: EmploymentOrgNode;
    fullOrgPath: EmploymentOrgNode[];
    companyNodes: EmploymentOrgNode[];
  };
  position: Position;
};

type EmploymentOrgNode = Pick<
  Organization,
  "id" | "orgCode" | "orgName" | "orgType" | "level" | "parentId" | "isVirtual" | "isEntity"
> & {
  pathIndex: number;
  distanceToAssignedOrg: number;
};

async function attachEmploymentRelations(rows: Employment[], tx: DbClient): Promise<EmploymentWithRelations[]> {
  if (rows.length === 0) {
    return [];
  }

  const userIds = [...new Set(rows.map(row => row.userId))];
  const orgIds = [...new Set(rows.map(row => row.orgId))];
  const posIds = [...new Set(rows.map(row => row.posId))];
  const ancestor = alias(organizations, "employment_org_ancestor");

  const [userRows, orgPathRows, posRows] = await Promise.all([
    tx.select().from(users).where(inArray(users.id, userIds)),
    tx
      .select({
        descendantId: organizationClosures.descendantId,
        depth: organizationClosures.depth,
        id: ancestor.id,
        orgCode: ancestor.orgCode,
        orgName: ancestor.orgName,
        orgType: ancestor.orgType,
        level: ancestor.level,
        parentId: ancestor.parentId,
        isVirtual: ancestor.isVirtual,
        isEntity: ancestor.isEntity,
      })
      .from(organizationClosures)
      .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
      .where(and(
        inArray(organizationClosures.descendantId, orgIds),
        eq(ancestor.isDelete, false),
      )),
    tx.select().from(positions).where(inArray(positions.id, posIds)),
  ]);

  const userMap = new Map(userRows.map(user => [user.id, user]));
  const posMap = new Map(posRows.map(pos => [pos.id, pos]));
  const orgPathMap = new Map<number, EmploymentOrgNode[]>();
  for (const { descendantId, depth, ...org } of orgPathRows) {
    const path = orgPathMap.get(descendantId) ?? [];
    path.push({
      ...org,
      pathIndex: 0,
      distanceToAssignedOrg: depth,
    });
    orgPathMap.set(descendantId, path);
  }

  for (const [orgId, path] of orgPathMap) {
    orgPathMap.set(
      orgId,
      path
        .sort((a, b) => b.distanceToAssignedOrg - a.distanceToAssignedOrg || a.id - b.id)
        .map((node, pathIndex) => ({ ...node, pathIndex })),
    );
  }

  return rows
    .map((row) => {
      const fullOrgPath = orgPathMap.get(row.orgId) ?? [];
      const assignedOrg = fullOrgPath.find(node => node.id === row.orgId);
      return {
        ...row,
        user: userMap.get(row.userId),
        organization: assignedOrg === undefined
          ? undefined
          : {
              assignedOrg,
              fullOrgPath,
              companyNodes: fullOrgPath.filter(node => node.orgType === OrganizationType.Company),
            },
        position: posMap.get(row.posId),
      };
    })
    .filter((row): row is EmploymentWithRelations =>
      row.user !== undefined
      && row.organization !== undefined
      && row.position !== undefined,
    );
}

export async function getEmploymentsByUserId(userId: number, tx: DbClient = db) {
  const rows = await tx.query.employments.findMany({
    where: {
      userId,
      status: EmploymentStatus.Enable,
      isDelete: false,
    },
  });
  return await attachEmploymentRelations(rows, tx);
}

export async function getAllEmploymentsByUserIdForAdmin(userId: number, tx: DbClient = db) {
  const rows = await tx.query.employments.findMany({
    where: {
      userId,
      isDelete: false,
    },
  });
  return await attachEmploymentRelations(rows, tx);
}

export async function getEmploymentByUserOrgPosId(
  userId: number,
  orgId: number,
  posId: number,
  tx: DbClient = db,
) {
  const row = await tx.query.employments.findFirst({
    where: {
      userId,
      orgId,
      posId,
      status: EmploymentStatus.Enable,
      isDelete: false,
    },
  });
  return (await attachEmploymentRelations(row === undefined ? [] : [row], tx))[0] ?? null;
}

export async function getEmploymentByIdForAdmin(
  id: number,
  tx: DbClient = db,
) {
  const row = await tx.query.employments.findFirst({
    where: {
      id,
      isDelete: false,
    },
  });
  return (await attachEmploymentRelations(row === undefined ? [] : [row], tx))[0] ?? null;
}

function buildOrganizationFilterCondition(
  organization: EmploymentAdminPaginationQueryDto["conditions"]["exactConditions"]["organization"],
): SQLWrapper | undefined {
  if (organization === undefined) {
    return undefined;
  }

  const orgCodes = organization.orgCodes;
  const orgTypes = organization.orgTypes;
  if ((orgCodes === undefined || orgCodes.length === 0) && (orgTypes === undefined || orgTypes.length === 0)) {
    return undefined;
  }

  const assigned = alias(organizations, "employment_filter_assigned_org");
  const ancestor = alias(organizations, "employment_filter_ancestor_org");
  const assignedTypeCondition = orgTypes === undefined
    ? undefined
    : exists(
        db.select({ value: sql`1` }).from(assigned).where(and(
          eq(assigned.id, employments.orgId),
          eq(assigned.isDelete, false),
          inArrayIf(assigned.orgType, orgTypes),
        )),
      );

  if (organization.matchMode === "exact") {
    return and(
      exists(
        db.select({ value: sql`1` }).from(assigned).where(and(
          eq(assigned.id, employments.orgId),
          eq(assigned.isDelete, false),
          inArrayIf(assigned.orgCode, orgCodes),
        )),
      ),
      assignedTypeCondition,
    );
  }

  return and(
    exists(
      db.select({ value: sql`1` })
        .from(organizationClosures)
        .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
        .where(and(
          eq(organizationClosures.descendantId, employments.orgId),
          eq(ancestor.isDelete, false),
          organization.matchMode === "company" ? eq(ancestor.orgType, OrganizationType.Company) : undefined,
          inArrayIf(ancestor.orgCode, orgCodes),
        )),
    ),
    assignedTypeCondition,
  );
}

function buildLegacyOrganizationFilterCondition(dto: EmploymentAdminPaginationQueryDto): SQLWrapper | undefined {
  const { companyOrgCodes, deptOrgCodes } = dto.conditions.exactConditions;
  if (companyOrgCodes === undefined && deptOrgCodes === undefined) {
    return undefined;
  }
  return and(
    buildOrganizationFilterCondition(
      deptOrgCodes === undefined
        ? undefined
        : { orgCodes: deptOrgCodes, matchMode: "exact" },
    ),
    buildOrganizationFilterCondition(
      companyOrgCodes === undefined
        ? undefined
        : { orgCodes: companyOrgCodes, matchMode: "company" },
    ),
  );
}

function buildEmploymentAdminWhere(dto: EmploymentAdminPaginationQueryDto) {
  const text = dto.conditions.fuzzyConditions.text;
  const organizationCondition = buildOrganizationFilterCondition(dto.conditions.exactConditions.organization)
    ?? buildLegacyOrganizationFilterCondition(dto);
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
    organizationCondition,
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
    isPrimary?: boolean;
    startTime?: Date;
    description?: string | null;
    status?: EmploymentStatus;
  },
  tx: DbClient = db,
) {
  return firstRow(await tx.insert(employments).values({
    userId: data.userId,
    posId: data.posId,
    orgId: data.orgId,
    isPrimary: data.isPrimary ?? false,
    startTime: data.startTime ?? new Date(),
    description: data.description ?? null,
    status: data.status ?? EmploymentStatus.Enable,
  }).returning())!;
}

export async function updateEmploymentRecord(
  id: number,
  data: {
    isPrimary?: boolean;
    startTime?: Date;
    endTime?: Date | null;
    description?: string | null;
    status?: EmploymentStatus;
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
      status: EmploymentStatus.Disable,
      endTime: new Date(),
    })
    .where(and(
      eq(employments.userId, userId),
      eq(employments.isDelete, false),
      inArray(employments.status, [EmploymentStatus.Enable, EmploymentStatus.Pause]),
    ));
}
