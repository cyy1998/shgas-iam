import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import type { SQLWrapper } from "drizzle-orm";
import type { AdminEmploymentReadScope } from "./employment.port";
import type {
  AdminEmploymentAuthorizationFacts,
  AdminEmploymentRecordCreate,
  AdminEmploymentRecordUpdate,
  EmploymentAdminPaginationQueryDto,
} from "./employment.type";
import { EmploymentStatus, OrganizationType } from "@iam/contracts";
import { extractPostgresError } from "@iam/db/postgres-error";
import { compactUpdate, firstRow, ilikeContainsIf, inArrayIf } from "@iam/db/query-utils";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { EmploymentAlreadyExistsError, OPEN_EMPLOYMENT_STATUSES } from "@iam/domain/employment";
import { and, asc, count, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const EMPLOYMENT_ACTIVE_RELATIONSHIP_UNIQUE_INDEX = "employment_active_relationship_unique_idx";

export function createEmploymentRepository(db: DbClient) {
  async function lockEmploymentsByIds(ids: readonly number[]) {
    if (ids.length === 0)
      return [];
    const rows = await db.select().from(employments).where(inArray(employments.id, [...new Set(ids)])).orderBy(asc(employments.id)).for("update");
    if (rows.length !== new Set(ids).size)
      throw new Error("Selected Employment lock returned missing rows");
    return rows;
  }
  return {
    lockEmploymentsByIds,
    async getOpenEmploymentIdsByUserId(userId: number) {
      return (await db.select({ id: employments.id }).from(employments).where(and(
        eq(employments.userId, userId),
        eq(employments.isDelete, false),
        inArray(employments.status, OPEN_EMPLOYMENT_STATUSES),
      ))).map(row => row.id);
    },
    async getOpenPrimaryEmploymentIdsByUserId(userId: number) {
      return (await db.select({ id: employments.id }).from(employments).where(and(
        eq(employments.userId, userId),
        eq(employments.isPrimary, true),
        eq(employments.isDelete, false),
        inArray(employments.status, OPEN_EMPLOYMENT_STATUSES),
      ))).map(row => row.id);
    },
    async lockEmploymentByIdForAdmin(id: number) {
      const row = firstRow(await db.select().from(employments).where(and(eq(employments.id, id), eq(employments.isDelete, false))).for("update"));
      return (await attachEmploymentRelations(row === null ? [] : [row], db))[0] ?? null;
    },
    async lockEmploymentLifecycleContextById(id: number) {
      const employment = firstRow(await db.select().from(employments).where(and(eq(employments.id, id), eq(employments.isDelete, false))).for("update"));
      if (employment === null)
        return null;
      const [organization, position] = await Promise.all([
        db.query.organizations.findFirst({ where: { id: employment.orgId } }),
        db.query.positions.findFirst({ where: { id: employment.posId } }),
      ]);
      return { employment, organization: organization ?? null, position: position ?? null };
    },
    async getEmploymentsByUserId(userId: number) {
      const rows = await db.query.employments.findMany({
        where: {
          userId,
          status: EmploymentStatus.Enable,
          isDelete: false,
        },
      });
      return await attachEmploymentRelations(rows, db);
    },
    async getAllEmploymentsByUserIdForAdmin(userId: number) {
      const rows = await db.query.employments.findMany({
        where: {
          userId,
          isDelete: false,
        },
      });
      return await attachEmploymentRelations(rows, db);
    },
    async getEmploymentLifecycleContextById(id: number) {
      const employment = await db.query.employments.findFirst({
        where: { id, isDelete: false },
      });
      if (employment === undefined) {
        return null;
      }

      const [organization, position] = await Promise.all([
        db.query.organizations.findFirst({ where: { id: employment.orgId } }),
        db.query.positions.findFirst({ where: { id: employment.posId } }),
      ]);
      return {
        employment,
        organization: organization ?? null,
        position: position ?? null,
      };
    },
    async getOpenEmploymentByUserOrgPosId(
      userId: number,
      orgId: number,
      posId: number,
      exceptEmploymentId?: number,
    ) {
      const row = await db.query.employments.findFirst({
        where: {
          userId,
          orgId,
          posId,
          ...(exceptEmploymentId === undefined ? {} : { id: { ne: exceptEmploymentId } }),
          status: { in: [...OPEN_EMPLOYMENT_STATUSES] },
          isDelete: false,
        },
      });
      return row ?? null;
    },
    async getEmploymentByIdForAdmin(id: number, scope?: AdminEmploymentReadScope) {
      const row = await db.query.employments.findFirst({
        where: {
          id,
          isDelete: false,
          ...(scope === undefined ? {} : { orgId: { in: [...scope.organizationIds] } }),
        },
      });
      return (await attachEmploymentRelations(row === undefined ? [] : [row], db))[0] ?? null;
    },
    async getEmploymentAuthorizationFactsByIdForAdmin(
      id: number,
    ): Promise<AdminEmploymentAuthorizationFacts | null> {
      const row = firstRow(await db
        .select({
          organizationId: employments.orgId,
          status: employments.status,
          userStatus: users.status,
          isPrimary: employments.isPrimary,
        })
        .from(employments)
        .innerJoin(users, eq(users.id, employments.userId))
        .where(and(eq(employments.id, id), eq(employments.isDelete, false)))
        .limit(1));
      return row ?? null;
    },
    async searchEmploymentsFuzzyForAdminPaged(
      dto: EmploymentAdminPaginationQueryDto,
      scope?: AdminEmploymentReadScope,
    ) {
      const { pageNum, pageSize } = dto;
      const where = buildEmploymentAdminWhere(dto, db, scope);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(employments)
          .where(where)
          .orderBy(desc(employments.isPrimary), desc(employments.id))
          .limit(pageSize)
          .offset((pageNum - 1) * pageSize),
        db.select({ value: count() }).from(employments).where(where),
      ]);
      return { rows: await attachEmploymentRelations(rows, db), total: firstRow(totalRows)?.value ?? 0 };
    },
    async createEmploymentRecord(data: AdminEmploymentRecordCreate) {
      try {
        const created = firstRow(await db.insert(employments).values({
          userId: data.userId,
          posId: data.posId,
          orgId: data.orgId,
          isPrimary: data.isPrimary,
          startTime: data.startTime,
          endTime: data.endTime,
          description: data.description,
          status: data.status,
        }).returning());
        if (created === null)
          throw new Error("Employment insert returned no row");
        return created;
      }
      catch (error) {
        if (isEmploymentActiveRelationshipUniqueViolation(error))
          throw new EmploymentAlreadyExistsError("相同任职关系已存在");
        throw error;
      }
    },
    async updateEmploymentRecord(id: number, data: AdminEmploymentRecordUpdate) {
      try {
        const updated = firstRow(await db
          .update(employments)
          .set(compactUpdate(data))
          .where(and(eq(employments.id, id), eq(employments.isDelete, false)))
          .returning());
        if (updated === null)
          throw new Error("Employment update returned no row");
        return updated;
      }
      catch (error) {
        if (isEmploymentActiveRelationshipUniqueViolation(error))
          throw new EmploymentAlreadyExistsError("相同任职关系已存在");
        throw error;
      }
    },
  };
}

export type EmploymentRepository = ReturnType<typeof createEmploymentRepository>;

function isEmploymentActiveRelationshipUniqueViolation(error: unknown) {
  const detail = extractPostgresError(error);
  return detail?.code === "23505"
    && detail.constraint === EMPLOYMENT_ACTIVE_RELATIONSHIP_UNIQUE_INDEX;
}

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

function buildOrganizationFilterCondition(
  organization: EmploymentAdminPaginationQueryDto["conditions"]["exactConditions"]["organization"],
  tx: DbClient,
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
        tx.select({ value: sql`1` }).from(assigned).where(and(
          eq(assigned.id, employments.orgId),
          eq(assigned.isDelete, false),
          inArrayIf(assigned.orgType, orgTypes),
        )),
      );

  if (organization.matchMode === "exact") {
    return and(
      exists(
        tx.select({ value: sql`1` }).from(assigned).where(and(
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
      tx.select({ value: sql`1` })
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

function buildLegacyOrganizationFilterCondition(
  dto: EmploymentAdminPaginationQueryDto,
  tx: DbClient,
): SQLWrapper | undefined {
  const { companyOrgCodes, deptOrgCodes } = dto.conditions.exactConditions;
  if (companyOrgCodes === undefined && deptOrgCodes === undefined) {
    return undefined;
  }
  return and(
    buildOrganizationFilterCondition(
      deptOrgCodes === undefined
        ? undefined
        : { orgCodes: deptOrgCodes, matchMode: "exact" },
      tx,
    ),
    buildOrganizationFilterCondition(
      companyOrgCodes === undefined
        ? undefined
        : { orgCodes: companyOrgCodes, matchMode: "company" },
      tx,
    ),
  );
}

function buildEmploymentAdminWhere(
  dto: EmploymentAdminPaginationQueryDto,
  tx: DbClient,
  scope?: AdminEmploymentReadScope,
) {
  const text = dto.conditions.fuzzyConditions.text;
  const organizationCondition = buildOrganizationFilterCondition(dto.conditions.exactConditions.organization, tx)
    ?? buildLegacyOrganizationFilterCondition(dto, tx);
  return and(
    eq(employments.isDelete, false),
    inArrayIf(employments.orgId, scope?.organizationIds),
    inArrayIf(employments.status, dto.conditions.exactConditions.statuses),
    dto.conditions.exactConditions.isPrimary === undefined
      ? undefined
      : eq(employments.isPrimary, dto.conditions.exactConditions.isPrimary),
    exists(
      tx.select({ value: sql`1` }).from(users).where(and(
        eq(users.id, employments.userId),
        eq(users.isDelete, false),
        inArrayIf(users.username, dto.conditions.exactConditions.usernames),
      )),
    ),
    organizationCondition,
    exists(
      tx.select({ value: sql`1` }).from(positions).where(and(
        eq(positions.id, employments.posId),
        eq(positions.isDelete, false),
        inArrayIf(positions.posCode, dto.conditions.exactConditions.posCodes),
      )),
    ),
    buildEmploymentFuzzyTextCondition(text, tx),
  );
}

function buildEmploymentFuzzyTextCondition(text: string | undefined, tx: DbClient): SQLWrapper | undefined {
  if (text === undefined) {
    return undefined;
  }
  const pattern = `%${text}%`;
  return or(
    sql`${employments.id}::text ILIKE ${pattern}`,
    exists(
      tx.select({ value: sql`1` }).from(users).where(and(
        eq(users.id, employments.userId),
        eq(users.isDelete, false),
        or(ilikeContainsIf(users.username, text), ilikeContainsIf(users.name, text)),
      )),
    ),
    exists(
      tx.select({ value: sql`1` }).from(organizations).where(and(
        eq(organizations.id, employments.orgId),
        eq(organizations.isDelete, false),
        or(ilikeContainsIf(organizations.orgCode, text), ilikeContainsIf(organizations.orgName, text)),
      )),
    ),
    exists(
      tx.select({ value: sql`1` }).from(positions).where(and(
        eq(positions.id, employments.posId),
        eq(positions.isDelete, false),
        or(ilikeContainsIf(positions.posCode, text), ilikeContainsIf(positions.posName, text)),
      )),
    ),
  );
}
