import type { DbClient } from "@iam/db";
import type { RoleAssignmentResolver } from "@iam/role-assignment-resolution";
import type { OidcAuthorizationClaim } from "../provider/authorization-claim.ts";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
  PrivilegeStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  privileges,
  rolePrivileges,
} from "@iam/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  assembleOidcAuthorizationClaim,
  buildOidcAuthorizationEmployment,
} from "../provider/authorization-claim.ts";

export function createOidcAuthorizationRepository(
  db: DbClient,
  roleAssignmentResolver: Pick<RoleAssignmentResolver, "resolveEffectiveRoles">,
) {
  return {
    async buildClaim(userId: number, iamClientId: number): Promise<OidcAuthorizationClaim> {
      const employmentSelection = db.select({
        id: employments.id,
        orgId: employments.orgId,
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
      const pathByOrg = new Map<number, Array<(typeof pathRows)[number]>>();
      for (const row of pathRows) {
        const path = pathByOrg.get(row.descendantId) ?? [];
        path.push(row);
        pathByOrg.set(row.descendantId, path);
      }
      for (const path of pathByOrg.values())
        path.sort((a, b) => b.depth - a.depth || a.id - b.id);

      const effectiveRolesByEmployment = await roleAssignmentResolver.resolveEffectiveRoles({
        employmentIds,
        clientId: iamClientId,
      });
      const allEffectiveRoles = [...effectiveRolesByEmployment.values()].flat();
      const allRoleIds = [...new Set(allEffectiveRoles.map(role => role.id))];
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
        effectiveRoles: effectiveRolesByEmployment.get(employment.id) ?? [],
      }, privilegesByRole));

      return assembleOidcAuthorizationClaim(claimEmployments);
    },
  };
}

export type OidcAuthorizationRepository = ReturnType<typeof createOidcAuthorizationRepository>;
