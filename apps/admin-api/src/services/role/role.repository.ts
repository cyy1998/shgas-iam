import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { compactUpdate, firstRow, ilikeContainsIf } from "@iam/db/query-utils";
import { clients, employments, organizations, positions, roleInclusions, roles, users } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import type { RoleAssignmentTargetSummaryDto } from "@iam/domain/role";
import { RoleAssignmentExistsError, RoleCodeExistsError } from "@iam/domain/role";
import type { SQLWrapper } from "drizzle-orm";
import { and, count, eq, exists, inArray, or, sql } from "drizzle-orm";
import type {
  AdminRoleAssignmentCreateRecord,
  AdminRoleCreateRecord,
  RoleAssignmentPaginationQueryDto,
  RoleInclusionEndpointDto,
  RoleInclusionPatch,
  RolePaginationQueryDto,
  RoleProfileUpdateDto,
} from "./role.type";

export function createRoleRepository(db: DbClient) {
  async function write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const detail = extractPostgresError(error);
      if (detail?.code === "23505") {
        if (detail.constraint === "role_role_code_key" || detail.constraint === "role_role_code_unique")
          throw new RoleCodeExistsError();
        if (detail.constraint === "role_assignment_role_id_target_type_target_id_key")
          throw new RoleAssignmentExistsError();
      }
      throw error;
    }
  }
  return {
    async getRoleNamesByIds(ids: number[]) {
      if (ids.length === 0) return [];
      return db
        .select({ roleCode: roles.roleCode, roleName: roles.roleName })
        .from(roles)
        .where(inArray(roles.id, ids));
    },
    async lockRoleByCode(roleCode: string, strength: "update" | "key share" = "update") {
      const rows = await db
        .select()
        .from(roles)
        .where(and(eq(roles.roleCode, roleCode), eq(roles.isDelete, false)))
        .for(strength);
      return firstRow(await attachRoleContext(rows, db));
    },
    async lockAssignmentByIdForRole(roleId: number, assignmentId: number) {
      const rows = await db
        .select()
        .from(roleAssignments)
        .where(and(eq(roleAssignments.roleId, roleId), eq(roleAssignments.id, assignmentId)))
        .for("update");
      return firstRow(await attachAssignmentTargets(rows, db));
    },
    async getRoleByCode(roleCode: string) {
      const row = await db.query.roles.findFirst({
        where: { roleCode, isDelete: false },
      });
      return firstRow(await attachRoleContext(row === undefined ? [] : [row], db)) ?? null;
    },

    async getRoleInclusions(roleId: number) {
      const rows = await db
        .select({
          containerRoleId: roleInclusions.containerRoleId,
          endpoint: {
            id: roles.id,
            roleCode: roles.roleCode,
            roleName: roles.roleName,
            roleType: roles.roleType,
            status: roles.status,
          },
          client: {
            id: clients.id,
            clientCode: clients.clientCode,
            clientName: clients.clientName,
            status: clients.status,
          },
        })
        .from(roleInclusions)
        .innerJoin(
          roles,
          sql`${roles.id} = case when ${roleInclusions.containerRoleId} = ${roleId}
            then ${roleInclusions.memberRoleId} else ${roleInclusions.containerRoleId} end`,
        )
        .leftJoin(clients, eq(clients.id, roles.clientId))
        .where(and(involvesRole(roleId), eq(roles.isDelete, false)))
        .orderBy(roles.roleCode);
      const members: RoleInclusionEndpointDto[] = [];
      const containers: RoleInclusionEndpointDto[] = [];
      for (const { containerRoleId, endpoint, client } of rows) {
        const target = containerRoleId === roleId ? members : containers;
        target.push({ ...endpoint, client });
      }
      return { members, containers };
    },

    async lockRoleInclusionGraph() {
      // Called first in the mutation transaction, before acquiring any Role row lock.
      // A separate read-committed statement sees changes by the previous lock holder.
      await db.execute(sql`set transaction isolation level read committed`);
      await db.execute(sql`select pg_advisory_xact_lock(hashtextextended('iam:role-inclusion-graph', 0))`);
    },

    async deleteRoleInclusions(roleId: number) {
      return db.delete(roleInclusions).where(involvesRole(roleId)).returning({
        containerRoleId: roleInclusions.containerRoleId,
        memberRoleId: roleInclusions.memberRoleId,
      });
    },

    async getUndeletedRoleIds(ids: number[]) {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(inArray(roles.id, ids), eq(roles.isDelete, false)));
      return rows.map(({ id }) => id);
    },

    async wouldCreateRoleInclusionCycle(containerRoleId: number, memberRoleIds: number[]) {
      if (memberRoleIds.length === 0) return false;
      const [result] = await db.execute<{ cyclic: boolean }>(sql`
        with recursive descendants(role_id) as (
          select ${roles.id} from ${roles} where ${inArray(roles.id, memberRoleIds)}
          union
          select ${roleInclusions.memberRoleId}
          from descendants
          join ${roleInclusions} on ${roleInclusions.containerRoleId} = descendants.role_id
        )
        select exists (select 1 from descendants where role_id = ${containerRoleId}) as cyclic
      `);
      return result!.cyclic;
    },

    async applyRoleInclusionPatch(containerRoleId: number, patch: RoleInclusionPatch) {
      const removed =
        patch.removeRoleIds.length === 0
          ? []
          : await db
              .delete(roleInclusions)
              .where(
                and(
                  eq(roleInclusions.containerRoleId, containerRoleId),
                  inArray(roleInclusions.memberRoleId, patch.removeRoleIds),
                ),
              )
              .returning({ id: roleInclusions.memberRoleId });
      const added =
        patch.addRoleIds.length === 0
          ? []
          : await db
              .insert(roleInclusions)
              .values(patch.addRoleIds.map((memberRoleId) => ({ containerRoleId, memberRoleId })))
              .onConflictDoNothing({ target: [roleInclusions.containerRoleId, roleInclusions.memberRoleId] })
              .returning({ id: roleInclusions.memberRoleId });
      return {
        addRoleIds: added.map(({ id }) => id).sort((left, right) => left - right),
        removeRoleIds: removed.map(({ id }) => id).sort((left, right) => left - right),
      };
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
      return write(async () =>
        firstRow(
          await db
            .insert(roles)
            .values({
              roleCode: data.roleCode,
              roleName: data.roleName,
              roleKind: data.roleKind,
              roleType: data.roleType,
              clientId: data.clientId,
              status: data.status ?? RoleStatus.Enable,
              description: data.description ?? null,
            })
            .returning(),
        ),
      );
    },

    async updateRoleByCode(roleCode: string, data: RoleProfileUpdateDto) {
      return (
        firstRow(
          await db
            .update(roles)
            .set(compactUpdate(data))
            .where(and(eq(roles.roleCode, roleCode), eq(roles.isDelete, false)))
            .returning(),
        ) ?? null
      );
    },

    async softDeleteRoleByCode(roleCode: string) {
      return (
        firstRow(
          await db
            .update(roles)
            .set({ isDelete: true })
            .where(and(eq(roles.roleCode, roleCode), eq(roles.isDelete, false)))
            .returning(),
        ) ?? null
      );
    },

    async countAssignmentsByRoleId(roleId: number) {
      const rows = await db.select({ value: count() }).from(roleAssignments).where(eq(roleAssignments.roleId, roleId));
      return firstRow(rows)?.value ?? 0;
    },

    async lockClientForRoleCreation(clientCode: string) {
      // Client deletion locks this row before checking for undeleted Roles.
      return firstRow(
        await db
          .select({
            id: clients.id,
            clientCode: clients.clientCode,
            clientName: clients.clientName,
            status: clients.status,
          })
          .from(clients)
          .where(and(eq(clients.clientCode, clientCode), eq(clients.isDelete, false)))
          .for("key share"),
      );
    },

    async getAssignableOrganizationByCode(orgCode: string) {
      const row = await db.query.organizations.findFirst({
        where: { orgCode, status: OrganizationStatus.Enable, isDelete: false },
      });
      return row === undefined
        ? null
        : ({
            id: row.id,
            code: row.orgCode,
            name: row.orgName,
            status: row.status,
            description: null,
          } satisfies RoleAssignmentTargetSummaryDto);
    },

    async getAssignablePositionByCode(posCode: string) {
      const row = await db.query.positions.findFirst({
        where: { posCode, status: PositionStatus.Enable, isDelete: false },
      });
      return row === undefined
        ? null
        : ({
            id: row.id,
            code: row.posCode,
            name: row.posName,
            status: row.status,
            description: row.description,
          } satisfies RoleAssignmentTargetSummaryDto);
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
        .where(
          and(
            eq(employments.id, employmentId),
            eq(employments.status, EmploymentStatus.Enable),
            eq(employments.isDelete, false),
          ),
        )
        .limit(1);
      const row = firstRow(rows);
      return row === null
        ? null
        : ({
            id: row.id,
            code: String(row.id),
            name: `${row.userName} / ${row.orgName} / ${row.posName}`,
            status: row.status,
            description: row.description ?? row.username,
          } satisfies RoleAssignmentTargetSummaryDto);
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

    async createAssignment(data: AdminRoleAssignmentCreateRecord) {
      return write(async () => firstRow(await db.insert(roleAssignments).values(data).returning()));
    },

    async updateAssignmentScope(roleId: number, assignmentId: number, includeDescendants: boolean) {
      return (
        firstRow(
          await db
            .update(roleAssignments)
            .set({ includeDescendants })
            .where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.roleId, roleId)))
            .returning(),
        ) ?? null
      );
    },

    async deleteAssignment(roleId: number, assignmentId: number) {
      return (
        firstRow(
          await db
            .delete(roleAssignments)
            .where(and(eq(roleAssignments.id, assignmentId), eq(roleAssignments.roleId, roleId)))
            .returning(),
        ) ?? null
      );
    },
  };
}

export type RoleRepository = ReturnType<typeof createRoleRepository>;

function involvesRole(roleId: number) {
  return or(eq(roleInclusions.containerRoleId, roleId), eq(roleInclusions.memberRoleId, roleId));
}

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
    exactConditions.roleType === undefined ? undefined : eq(roles.roleType, exactConditions.roleType),
    exactConditions.clientCode === undefined
      ? undefined
      : exists(
          tx
            .select({ value: sql`1` })
            .from(clients)
            .where(
              and(
                eq(clients.id, roles.clientId),
                eq(clients.clientCode, exactConditions.clientCode),
                eq(clients.isDelete, false),
              ),
            ),
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
      tx
        .select({ value: sql`1` })
        .from(organizations)
        .where(
          and(
            eq(roleAssignments.targetType, RoleAssignmentTargetType.Organization),
            eq(organizations.id, roleAssignments.targetId),
            or(ilikeContainsIf(organizations.orgCode, text), ilikeContainsIf(organizations.orgName, text)),
          ),
        ),
    ),
    exists(
      tx
        .select({ value: sql`1` })
        .from(positions)
        .where(
          and(
            eq(roleAssignments.targetType, RoleAssignmentTargetType.Position),
            eq(positions.id, roleAssignments.targetId),
            or(ilikeContainsIf(positions.posCode, text), ilikeContainsIf(positions.posName, text)),
          ),
        ),
    ),
    exists(
      tx
        .select({ value: sql`1` })
        .from(employments)
        .innerJoin(users, eq(users.id, employments.userId))
        .innerJoin(organizations, eq(organizations.id, employments.orgId))
        .innerJoin(positions, eq(positions.id, employments.posId))
        .where(
          and(
            eq(roleAssignments.targetType, RoleAssignmentTargetType.Employment),
            eq(employments.id, roleAssignments.targetId),
            or(
              sql`${roleAssignments.targetId}::text ILIKE ${pattern}`,
              ilikeContainsIf(users.username, text),
              ilikeContainsIf(users.name, text),
              ilikeContainsIf(organizations.orgCode, text),
              ilikeContainsIf(organizations.orgName, text),
              ilikeContainsIf(positions.posCode, text),
              ilikeContainsIf(positions.posName, text),
            ),
          ),
        ),
    ),
  );
}

async function attachRoleContext(rows: RoleRow[], tx: DbClient) {
  if (rows.length === 0) {
    return [];
  }
  const clientIds = [...new Set(rows.flatMap((row) => (row.clientId === null ? [] : [row.clientId])))];
  const roleIds = rows.map((row) => row.id);
  const [clientRows, assignmentCountRows] = await Promise.all([
    clientIds.length === 0
      ? Promise.resolve([])
      : tx
          .select({
            id: clients.id,
            clientCode: clients.clientCode,
            clientName: clients.clientName,
            status: clients.status,
          })
          .from(clients)
          .where(inArray(clients.id, clientIds)),
    tx
      .select({
        roleId: roleAssignments.roleId,
        value: count(),
      })
      .from(roleAssignments)
      .where(inArray(roleAssignments.roleId, roleIds))
      .groupBy(roleAssignments.roleId),
  ]);
  const clientMap = new Map(clientRows.map((client) => [client.id, client]));
  const assignmentCountMap = new Map(assignmentCountRows.map((row) => [row.roleId, row.value]));
  return rows.map((row) => ({
    ...row,
    client: row.clientId === null ? null : (clientMap.get(row.clientId) ?? null),
    assignmentCount: assignmentCountMap.get(row.id) ?? 0,
  }));
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

  return rows.map((row) => ({
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
  return [...new Set(rows.filter((row) => row.targetType === targetType).map((row) => row.targetId))];
}

function targetKey(targetType: RoleAssignmentTargetType, targetId: number) {
  return `${targetType}:${targetId}`;
}
