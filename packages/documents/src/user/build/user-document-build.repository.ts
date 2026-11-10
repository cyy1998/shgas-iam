import type { EffectiveRole } from "@iam/assignment-resolution/role-assignment";
import { RoleType } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { Employment, Organization, User } from "@iam/db/schema";
import { clients, employments, organizationClosures, organizations, positions, roles, users } from "@iam/db/schema";
import { OPEN_EMPLOYMENT_STATUSES } from "@iam/domain/employment";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { UserDocumentSourceIntegrityError } from "./document-build.error";

export type UserDocumentBuildOrgPathRow = Pick<
  Organization,
  "id" | "orgCode" | "orgName" | "orgType" | "level" | "parentId" | "isVirtual" | "isEntity" | "status" | "isDelete"
> & {
  descendantId: number;
  depth: number;
};

export type UserDocumentBuildPosition = typeof positions.$inferSelect;

interface ResolvedUserDocumentBuildRoleRow {
  employmentId: number;
  roleId: number;
  roleCode: string;
}

export type UserDocumentBuildRoleRow = ResolvedUserDocumentBuildRoleRow &
  ({ roleType: RoleType.Client; clientCode: string } | { roleType: RoleType.Global });

export interface UserDocumentBuildDataset {
  users: User[];
  employments: Employment[];
  positions: UserDocumentBuildPosition[];
  orgPathRows: UserDocumentBuildOrgPathRow[];
  roleRows: UserDocumentBuildRoleRow[];
}

export interface UserDocumentEffectiveRoleResolverPort {
  readonly resolveEffectiveRoles: (input: {
    readonly employmentIds: readonly number[];
  }) => Promise<ReadonlyMap<number, readonly EffectiveRole[]>>;
}

export function createUserDocumentBuildRepository(
  db: DbClient,
  roleAssignmentResolver: UserDocumentEffectiveRoleResolverPort,
) {
  return {
    async loadByUserIds(userIds: number[], signal?: AbortSignal): Promise<UserDocumentBuildDataset> {
      signal?.throwIfAborted();
      const uniqueUserIds = [...new Set(userIds)];
      if (uniqueUserIds.length === 0) return emptyDataset();

      const [userRows, employmentRows] = await Promise.all([
        db.select().from(users).where(inArray(users.id, uniqueUserIds)),
        db
          .select()
          .from(employments)
          .where(
            and(
              inArray(employments.userId, uniqueUserIds),
              inArray(employments.status, [...OPEN_EMPLOYMENT_STATUSES]),
              eq(employments.isDelete, false),
            ),
          ),
      ]);
      signal?.throwIfAborted();

      const positionIds = [...new Set(employmentRows.map((row) => row.posId))];
      const organizationIds = [...new Set(employmentRows.map((row) => row.orgId))];
      const employmentIds = employmentRows.map((row) => row.id);

      const [positionRows, orgPathRows, roleRows] = await Promise.all([
        loadPositions(db, positionIds),
        loadOrganizationPaths(db, organizationIds),
        loadEmploymentRoles(roleAssignmentResolver, employmentIds),
      ]);
      signal?.throwIfAborted();
      const roleIds = [...new Set(roleRows.map((row) => row.roleId))];
      const roleOwnershipRows = await loadRoleOwnership(db, roleIds);
      signal?.throwIfAborted();
      const ownershipByRoleId = new Map(roleOwnershipRows.map((row) => [row.roleId, row]));

      return {
        users: userRows,
        employments: employmentRows,
        positions: positionRows,
        orgPathRows,
        roleRows: roleRows.map((row) => {
          const ownership = ownershipByRoleId.get(row.roleId);
          if (ownership?.roleType === RoleType.Global && ownership.clientCode === null)
            return { ...row, roleType: RoleType.Global };
          if (ownership?.roleType === RoleType.Client && ownership.clientCode !== null)
            return { ...row, roleType: RoleType.Client, clientCode: ownership.clientCode };
          throw new UserDocumentSourceIntegrityError(`Effective Role ${row.roleId} has invalid ownership`);
        }),
      };
    },
  };
}

export type UserDocumentBuildRepository = ReturnType<typeof createUserDocumentBuildRepository>;

function emptyDataset(): UserDocumentBuildDataset {
  return {
    users: [],
    employments: [],
    positions: [],
    orgPathRows: [],
    roleRows: [],
  };
}

async function loadPositions(db: DbClient, positionIds: number[]) {
  if (positionIds.length === 0) return [];

  return await db.select().from(positions).where(inArray(positions.id, positionIds));
}

async function loadOrganizationPaths(db: DbClient, organizationIds: number[]) {
  if (organizationIds.length === 0) return [];

  const ancestor = alias(organizations, "user_document_org_ancestor");
  return await db
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
      status: ancestor.status,
      isDelete: ancestor.isDelete,
    })
    .from(organizationClosures)
    .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
    .where(inArray(organizationClosures.descendantId, organizationIds));
}

async function loadEmploymentRoles(
  roleAssignmentResolver: UserDocumentEffectiveRoleResolverPort,
  employmentIds: number[],
): Promise<ResolvedUserDocumentBuildRoleRow[]> {
  if (employmentIds.length === 0) return [];

  const effectiveRolesByEmploymentId = await roleAssignmentResolver.resolveEffectiveRoles({ employmentIds });
  return employmentIds.flatMap((employmentId) =>
    (effectiveRolesByEmploymentId.get(employmentId) ?? []).map((role) => ({
      employmentId,
      roleId: role.id,
      roleCode: role.roleCode,
    })),
  );
}

async function loadRoleOwnership(db: DbClient, roleIds: number[]) {
  if (roleIds.length === 0) return [];

  return await db
    .select({
      roleId: roles.id,
      roleType: roles.roleType,
      clientCode: clients.clientCode,
    })
    .from(roles)
    .leftJoin(clients, eq(roles.clientId, clients.id))
    .where(inArray(roles.id, roleIds));
}
