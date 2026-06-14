import type { OidcAuthorizationClaim } from "./authorization-claim.ts";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  PrivilegeStatus,
  RoleStatus,
} from "@iam/contracts";
import { db } from "@iam/db";
import {
  employmentRoles,
  employments,
  organizationClosures,
  organizationRoles,
  organizations,
  positionRoles,
  positions,
  privileges,
  rolePrivileges,
  roles,
} from "@iam/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  assembleOidcAuthorizationClaim,
  buildOidcAuthorizationEmployment,
} from "./authorization-claim.ts";

export type { OidcAuthorizationClaim } from "./authorization-claim.ts";

export class OidcAuthorizationRepository {
  async buildClaim(userId: number, iamClientId: number): Promise<OidcAuthorizationClaim> {
    const employmentSelection = db.select({
      id: employments.id,
      orgId: employments.orgId,
      posId: employments.posId,
      orgCode: organizations.orgCode,
      orgName: organizations.orgName,
      orgType: organizations.orgType,
      orgOrderNum: organizations.orderNum,
      posCode: positions.posCode,
      posName: positions.posName,
    });
    const employmentsWithOrganizations = employmentSelection
      .from(employments)
      .innerJoin(organizations, eq(organizations.id, employments.orgId));
    const employmentsWithPositions = employmentsWithOrganizations.innerJoin(
      positions,
      eq(positions.id, employments.posId),
    );
    const employmentRows = await employmentsWithPositions.where(and(
      eq(employments.userId, userId),
      eq(employments.status, EmploymentStatus.Enable),
      eq(employments.isDelete, false),
      eq(organizations.status, OrganizationStatus.Enable),
      eq(organizations.isDelete, false),
      eq(positions.status, PositionStatus.Enable),
      eq(positions.isDelete, false),
    ));
    if (employmentRows.length === 0)
      return { employments: [], roles: [], privileges: [] };

    const employmentIds = employmentRows.map(row => row.id);
    const orgIds = [...new Set(employmentRows.map(row => row.orgId))];
    const posIds = [...new Set(employmentRows.map(row => row.posId))];
    const ancestor = alias(organizations, "oidc_authorization_org_ancestor");
    const pathRows = await db.select({
      descendantId: organizationClosures.descendantId,
      depth: organizationClosures.depth,
      id: ancestor.id,
      orgCode: ancestor.orgCode,
      orgName: ancestor.orgName,
      orgType: ancestor.orgType,
    }).from(organizationClosures).innerJoin(ancestor, eq(ancestor.id, organizationClosures.ancestorId)).where(and(
      inArray(organizationClosures.descendantId, orgIds),
      eq(ancestor.status, OrganizationStatus.Enable),
      eq(ancestor.isDelete, false),
    ));
    const ancestorIds = [...new Set(pathRows.map(row => row.id))];
    const [directRoleRows, positionRoleRows, organizationRoleRows, clientRoleRows] = await Promise.all([
      db.select().from(employmentRoles).where(inArray(employmentRoles.employmentId, employmentIds)),
      db.select().from(positionRoles).where(inArray(positionRoles.positionId, posIds)),
      ancestorIds.length === 0
        ? Promise.resolve([])
        : db.select().from(organizationRoles).where(inArray(organizationRoles.organizationId, ancestorIds)),
      db.select({
        id: roles.id,
        roleCode: roles.roleCode,
      }).from(roles).where(and(
        eq(roles.clientId, iamClientId),
        eq(roles.status, RoleStatus.Enable),
        eq(roles.isDelete, false),
      )),
    ]);

    const activeRoles = new Map(clientRoleRows.map(role => [role.id, role.roleCode]));
    const pathByOrg = new Map<number, Array<(typeof pathRows)[number]>>();
    for (const row of pathRows) {
      const path = pathByOrg.get(row.descendantId) ?? [];
      path.push(row);
      pathByOrg.set(row.descendantId, path);
    }
    for (const path of pathByOrg.values())
      path.sort((a, b) => b.depth - a.depth || a.id - b.id);

    const directRolesByEmployment = new Map<number, number[]>();
    for (const row of directRoleRows) {
      const roleIds = directRolesByEmployment.get(row.employmentId) ?? [];
      roleIds.push(row.roleId);
      directRolesByEmployment.set(row.employmentId, roleIds);
    }
    const positionRolesByPosition = new Map<number, number[]>();
    for (const row of positionRoleRows) {
      const roleIds = positionRolesByPosition.get(row.positionId) ?? [];
      roleIds.push(row.roleId);
      positionRolesByPosition.set(row.positionId, roleIds);
    }

    const roleIdsByEmployment = new Map<number, number[]>();
    for (const employment of employmentRows) {
      const ancestorIds = new Set((pathByOrg.get(employment.orgId) ?? []).map(node => node.id));
      const roleIds = new Set([
        ...(directRolesByEmployment.get(employment.id) ?? []),
        ...(positionRolesByPosition.get(employment.posId) ?? []),
      ]);
      for (const assignment of organizationRoleRows) {
        if ((!assignment.isAllSub && assignment.organizationId === employment.orgId)
          || (assignment.isAllSub && ancestorIds.has(assignment.organizationId))) {
          roleIds.add(assignment.roleId);
        }
      }
      roleIdsByEmployment.set(employment.id, [...roleIds].filter(roleId => activeRoles.has(roleId)));
    }

    const allRoleIds = [...new Set([...roleIdsByEmployment.values()].flat())];
    const privilegeRows = allRoleIds.length === 0
      ? []
      : await db.select({
          roleId: rolePrivileges.roleId,
          privilegeCode: privileges.privilegeCode,
        }).from(rolePrivileges).innerJoin(privileges, eq(privileges.id, rolePrivileges.privilegeId)).where(and(
          inArray(rolePrivileges.roleId, allRoleIds),
          eq(privileges.status, PrivilegeStatus.Enable),
          eq(privileges.isDelete, false),
        )).orderBy(asc(privileges.privilegeCode));
    const privilegesByRole = new Map<number, string[]>();
    for (const row of privilegeRows) {
      const codes = privilegesByRole.get(row.roleId) ?? [];
      codes.push(row.privilegeCode);
      privilegesByRole.set(row.roleId, codes);
    }

    const claimEmployments = employmentRows.map(employment => buildOidcAuthorizationEmployment({
      orderNum: employment.orgOrderNum,
      organization: {
        orgCode: employment.orgCode,
        orgName: employment.orgName,
        orgType: employment.orgType,
        fullOrgPath: (pathByOrg.get(employment.orgId) ?? []).map(node => ({
          orgCode: node.orgCode,
          orgName: node.orgName,
          orgType: node.orgType,
        })),
      },
      position: {
        posCode: employment.posCode,
        posName: employment.posName,
      },
      roleIds: roleIdsByEmployment.get(employment.id) ?? [],
    }, activeRoles, privilegesByRole));

    return assembleOidcAuthorizationClaim(claimEmployments);
  }
}
