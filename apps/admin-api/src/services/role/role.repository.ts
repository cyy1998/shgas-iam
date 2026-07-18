import type { DbClient } from "@iam/db";
import type { RoleAssignmentTargetSummaryDto } from "@iam/domain/role";
import type { SQLWrapper } from "drizzle-orm";
import type {
  AdminRoleAssignmentCreateRecord,
  AdminRoleCreateRecord,
  RoleAssignmentPaginationQueryDto,
  RolePaginationQueryDto,
  RoleUpdateDto,
} from "./role.type";
import { EmploymentStatus, OrganizationStatus, PositionStatus, RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import { compactUpdate, firstRow, ilikeContainsIf } from "@iam/db/query-utils";
import {
  clients,
  employments,
  organizations,
  positions,
  roleAssignments,
  roles,
  users,
} from "@iam/db/schema";
import { and, count, eq, exists, inArray, or, sql } from "drizzle-orm";

export function createRoleRepository(db: DbClient) {
  return {
    async getRoleByCode(roleCode: string) {
      const row = await db.query.roles.findFirst({
        where: { roleCode, isDelete: false },
      });
      return firstRow(await attachRoleContext(row === undefined ? [] : [row], db)) ?? null;
    },

    async getAnyRoleByCode(roleCode: string) {
      return await db.query.roles.findFirst({
        where: { roleCode },
      }) ?? null;
    },

    async searchRolesPaged(input: RolePaginationQueryDto) {
      const where = roleAdminWhere(input, db);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(roles)
          .where(where)
          .orderBy(roles.id)
          .limit(input.pageSize)
          .offset((input.pageNum - 1) * input.pageSize),
        db.select({ value: count() }).from(roles).where(where),
      ]);
      return {
        rows: await attachRoleContext(rows, db),
        total: firstRow(totalRows)?.value ?? 0,
      };
    },

    async createRole(data: AdminRoleCreateRecord) {
      return firstRow(await db.insert(roles).values({
        roleCode: data.roleCode,
        roleName: data.roleName,
        clientId: data.clientId,
        status: data.status ?? RoleStatus.Enable,
        description: data.description ?? null,
      }).returning())!;
    },

    async updateRoleByCode(roleCode: string, data: RoleUpdateDto) {
      return firstRow(await db
        .update(roles)
        .set(compactUpdate(data))
        .where(and(eq(roles.roleCode, roleCode), eq(roles.isDelete, false)))
        .returning()) ?? null;
    },

    async softDeleteRoleByCode(roleCode: string) {
      return firstRow(await db
        .update(roles)
        .set({ isDelete: true })
        .where(and(eq(roles.roleCode, roleCode), eq(roles.isDelete, false)))
        .returning()) ?? null;
    },

    async countAssignmentsByRoleId(roleId: number) {
      const rows = await db
        .select({ value: count() })
        .from(roleAssignments)
        .where(eq(roleAssignments.roleId, roleId));
      return firstRow(rows)?.value ?? 0;
    },

    async getClientByCode(clientCode: string) {
      return await db.query.clients.findFirst({
        where: { clientCode, isDelete: false },
      }) ?? null;
    },

    async getAssignableOrganizationByCode(orgCode: string) {
      const row = await db.query.organizations.findFirst({
        where: { orgCode, status: OrganizationStatus.Enable, isDelete: false },
      });
      return row === undefined
        ? null
        : {
          id: row.id,
          code: row.orgCode,
          name: row.orgName,
          status: row.status,
          description: null,
        } satisfies RoleAssignmentTargetSummaryDto;
    },

    async getAssignablePositionByCode(posCode: string) {
      const row = await db.query.positions.findFirst({
        where: { posCode, status: PositionStatus.Enable, isDelete: false },
      });
      return row === undefined
        ? null
        : {
          id: row.id,
          code: row.posCode,
          name: row.posName,
          status: row.status,
          description: row.description,
        } satisfies RoleAssignmentTargetSummaryDto;
    },

    async getAssignableEmploymentById(employmentId: number) {
      const rows = await db
        .select({
          id: employments.id,
          status: employments.status,
          description: employments.description,
          username: users.username,
          userName: users.name,
          orgName: organizations.orgName,
          posName: positions.posName,
        })
        .from(employments)
        .innerJoin(users, eq(users.id, employments.userId))
        .innerJoin(organizations, eq(organizations.id, employments.orgId))
        .innerJoin(positions, eq(positions.id, employments.posId))
        .where(and(
          eq(employments.id, employmentId),
          eq(employments.status, EmploymentStatus.Enable),
          eq(employments.isDelete, false),
        ))
        .limit(1);
      const row = firstRow(rows);
      return row === null
        ? null
        : {
          id: row.id,
          code: String(row.id),
          name: `${row.userName} / ${row.orgName} / ${row.posName}`,
          status: row.status,
          description: row.description ?? row.username,
        } satisfies RoleAssignmentTargetSummaryDto;
    },

    async searchAssignmentsPaged(roleId: number, input: RoleAssignmentPaginationQueryDto) {
      const where = roleAssignmentAdminWhere(roleId, input, db);
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(roleAssignments)
          .where(where)
          .orderBy(roleAssignments.id)
          .limit(input.pageSize)
          .offset((input.pageNum - 1) * input.pageSize),
        db.select({ value: count() }).from(roleAssignments).where(where),
      ]);
      return {
        rows: await attachAssignmentTargets(rows, db),
        total: firstRow(totalRows)?.value ?? 0,
      };
    },

    async getAssignmentByIdForRole(roleId: number, assignmentId: number) {
      const row = await db.query.roleAssignments.findFirst({
        where: { id: assignmentId, roleId },
      });
      return firstRow(await attachAssignmentTargets(row === undefined ? [] : [row], db)) ?? null;
    },

    async findAssignmentByRoleTarget(roleId: number, targetType: RoleAssignmentTargetType, targetId: number) {
      return await db.query.roleAssignments.findFirst({
        where: { roleId, targetType, targetId },
      }) ?? null;
    },

    async createAssignment(data: AdminRoleAssignmentCreateRecord) {
      return firstRow(await db.insert(roleAssignments).values(data).returning())!;
    },

    async updateAssignmentScope(roleId: number, assignmentId: number, includeDescendants: boolean) {
      return firstRow(await db
        .update(roleAssignments)
        .set({ includeDescendants })
        .where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.roleId, roleId)))
        .returning()) ?? null;
    },

    async deleteAssignment(roleId: number, assignmentId: number) {
      return firstRow(await db
        .delete(roleAssignments)
        .where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.roleId, roleId)))
        .returning()) ?? null;
    },
  };
}

export type RoleRepository = ReturnType<typeof createRoleRepository>;

type RoleRow = typeof roles.$inferSelect;
type RoleAssignmentRow = typeof roleAssignments.$inferSelect;

function roleAdminWhere(input: RolePaginationQueryDto, tx: DbClient) {
  const { fuzzyConditions, exactConditions } = input.conditions;
  return and(
    eq(roles.isDelete, false),
    fuzzyConditions.text === undefined
      ? undefined
      : or(
          ilikeContainsIf(roles.roleCode, fuzzyConditions.text),
          ilikeContainsIf(roles.roleName, fuzzyConditions.text),
        ),
    exactConditions.status === undefined ? undefined : eq(roles.status, exactConditions.status),
    exactConditions.clientCode === undefined
      ? undefined
      : exists(
          tx.select({ value: sql`1` }).from(clients).where(and(
            eq(clients.id, roles.clientId),
            eq(clients.clientCode, exactConditions.clientCode),
            eq(clients.isDelete, false),
          )),
        ),
  );
}

function roleAssignmentAdminWhere(roleId: number, input: RoleAssignmentPaginationQueryDto, tx: DbClient) {
  const { fuzzyConditions, exactConditions } = input.conditions;
  return and(
    eq(roleAssignments.roleId, roleId),
    exactConditions.targetType === undefined ? undefined : eq(roleAssignments.targetType, exactConditions.targetType),
    exactConditions.includeDescendants === undefined
      ? undefined
      : eq(roleAssignments.includeDescendants, exactConditions.includeDescendants),
    targetTextWhere(fuzzyConditions.text, tx),
  );
}

function targetTextWhere(text: string | undefined, tx: DbClient): SQLWrapper | undefined {
  if (text === undefined) {
    return undefined;
  }
  const pattern = `%${text}%`;
  return or(
    exists(
      tx.select({ value: sql`1` }).from(organizations).where(and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
        eq(organizations.id, roleAssignments.targetId),
        or(ilikeContainsIf(organizations.orgCode, text), ilikeContainsIf(organizations.orgName, text)),
      )),
    ),
    exists(
      tx.select({ value: sql`1` }).from(positions).where(and(
        eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
        eq(positions.id, roleAssignments.targetId),
        or(ilikeContainsIf(positions.posCode, text), ilikeContainsIf(positions.posName, text)),
      )),
    ),
    exists(
      tx.select({ value: sql`1` })
        .from(employments)
        .innerJoin(users, eq(users.id, employments.userId))
        .where(and(
          eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
          eq(employments.id, roleAssignments.targetId),
          or(
            sql`${roleAssignments.targetId}::text ILIKE ${pattern}`,
            ilikeContainsIf(users.username, text),
            ilikeContainsIf(users.name, text),
          ),
        )),
    ),
  );
}

async function attachRoleContext(rows: RoleRow[], tx: DbClient) {
  if (rows.length === 0) {
    return [];
  }
  const clientIds = [...new Set(rows.map(row => row.clientId))];
  const roleIds = rows.map(row => row.id);
  const [clientRows, assignmentCountRows] = await Promise.all([
    tx.select({
      id: clients.id,
      clientCode: clients.clientCode,
      clientName: clients.clientName,
      status: clients.status,
    }).from(clients).where(inArray(clients.id, clientIds)),
    tx.select({
      roleId: roleAssignments.roleId,
      value: count(),
    }).from(roleAssignments).where(inArray(roleAssignments.roleId, roleIds)).groupBy(roleAssignments.roleId),
  ]);
  const clientMap = new Map(clientRows.map(client => [client.id, client]));
  const assignmentCountMap = new Map(assignmentCountRows.map(row => [row.roleId, row.value]));
  return rows
    .map(row => ({
      ...row,
      client: clientMap.get(row.clientId),
      assignmentCount: assignmentCountMap.get(row.id) ?? 0,
    }))
    .filter((row): row is RoleRow & {
      client: NonNullable<(typeof row)["client"]>;
      assignmentCount: number;
    } => row.client !== undefined);
}

async function attachAssignmentTargets(rows: RoleAssignmentRow[], tx: DbClient) {
  if (rows.length === 0) {
    return [];
  }

  const orgIds = idsForTargetType(rows, RoleAssignmentTargetType.Organization);
  const posIds = idsForTargetType(rows, RoleAssignmentTargetType.Position);
  const employmentIds = idsForTargetType(rows, RoleAssignmentTargetType.Employment);
  const [orgRows, posRows, employmentRows] = await Promise.all([
    orgIds.length === 0
      ? Promise.resolve([])
      : tx.select().from(organizations).where(inArray(organizations.id, orgIds)),
    posIds.length === 0 ? Promise.resolve([]) : tx.select().from(positions).where(inArray(positions.id, posIds)),
    employmentIds.length === 0
      ? Promise.resolve([])
      : tx
          .select({
            id: employments.id,
            status: employments.status,
            description: employments.description,
            username: users.username,
            userName: users.name,
            orgName: organizations.orgName,
            posName: positions.posName,
          })
          .from(employments)
          .innerJoin(users, eq(users.id, employments.userId))
          .innerJoin(organizations, eq(organizations.id, employments.orgId))
          .innerJoin(positions, eq(positions.id, employments.posId))
          .where(inArray(employments.id, employmentIds)),
  ]);

  const targetMap = new Map<string, RoleAssignmentTargetSummaryDto>();
  for (const row of orgRows) {
    targetMap.set(targetKey(RoleAssignmentTargetType.Organization, row.id), {
      id: row.id,
      code: row.orgCode,
      name: row.orgName,
      status: row.status,
      description: null,
    });
  }
  for (const row of posRows) {
    targetMap.set(targetKey(RoleAssignmentTargetType.Position, row.id), {
      id: row.id,
      code: row.posCode,
      name: row.posName,
      status: row.status,
      description: row.description,
    });
  }
  for (const row of employmentRows) {
    targetMap.set(targetKey(RoleAssignmentTargetType.Employment, row.id), {
      id: row.id,
      code: String(row.id),
      name: `${row.userName} / ${row.orgName} / ${row.posName}`,
      status: row.status,
      description: row.description ?? row.username,
    });
  }

  return rows.map(row => ({
    ...row,
    target: targetMap.get(targetKey(row.targetType, row.targetId)) ?? {
      id: row.targetId,
      code: String(row.targetId),
      name: "已删除对象",
      status: null,
      description: null,
    },
  }));
}

function idsForTargetType(rows: RoleAssignmentRow[], targetType: RoleAssignmentTargetType) {
  return [...new Set(rows.filter(row => row.targetType === targetType).map(row => row.targetId))];
}

function targetKey(targetType: RoleAssignmentTargetType, targetId: number) {
  return `${targetType}:${targetId}`;
}
