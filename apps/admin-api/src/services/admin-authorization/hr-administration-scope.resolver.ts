import type { DbClient } from "@iam/db";
import type { RoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { EmploymentStatus, OrganizationLevel } from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
} from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface HrAdministrationScope {
  rootOrganizationIds: readonly number[];
  organizationIds: readonly number[];
}

export interface HrAdministrationScopeResolver {
  resolveForActor: (userId: number) => Promise<HrAdministrationScope | null>;
}

export interface CreateHrAdministrationScopeResolverDeps {
  db: DbClient;
  roleAssignmentResolver: Pick<RoleAssignmentResolver, "resolveEffectiveRoles">;
}

const HR_ADMIN_CLIENT_CODE = "iam-admin";
const HR_ADMIN_ROLE_CODE = "iam:hr-admin";
const scopedOrganization = alias(organizations, "hr_scope_organization");

export function createHrAdministrationScopeResolver(
  deps: CreateHrAdministrationScopeResolverDeps,
): HrAdministrationScopeResolver {
  return {
    async resolveForActor(userId) {
      const client = await deps.db.query.clients.findFirst({
        columns: { id: true },
        where: {
          clientCode: HR_ADMIN_CLIENT_CODE,
          isDelete: false,
        },
      });
      if (!client)
        return null;

      const employmentRows = await deps.db
        .select({ id: employments.id, organizationId: employments.orgId })
        .from(employments)
        .where(and(
          eq(employments.userId, userId),
          eq(employments.status, EmploymentStatus.Enable),
          eq(employments.isDelete, false),
        ));
      if (employmentRows.length === 0)
        return null;

      const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
        employmentIds: employmentRows.map(employment => employment.id),
        clientId: client.id,
      });
      const carrierOrganizationIds = uniqueSorted(employmentRows
        .filter(employment => rolesByEmployment.get(employment.id)
          ?.some(role => role.roleCode === HR_ADMIN_ROLE_CODE))
        .map(employment => employment.organizationId));
      if (carrierOrganizationIds.length === 0)
        return null;

      const rootRows = await deps.db
        .select({
          carrierOrganizationId: organizationClosures.descendantId,
          rootOrganizationId: organizations.id,
        })
        .from(organizationClosures)
        .innerJoin(organizations, eq(organizationClosures.ancestorId, organizations.id))
        .where(and(
          inArray(organizationClosures.descendantId, carrierOrganizationIds),
          eq(organizations.level, OrganizationLevel.One),
          eq(organizations.isDelete, false),
        ));

      const rootsByCarrier = new Map<number, Set<number>>();
      for (const row of rootRows) {
        const roots = rootsByCarrier.get(row.carrierOrganizationId) ?? new Set<number>();
        roots.add(row.rootOrganizationId);
        rootsByCarrier.set(row.carrierOrganizationId, roots);
      }
      if (carrierOrganizationIds.some(id => rootsByCarrier.get(id)?.size !== 1))
        return null;

      const rootOrganizationIds = uniqueSorted(carrierOrganizationIds.flatMap(
        id => [...(rootsByCarrier.get(id) ?? [])],
      ));
      const scopeRows = await deps.db
        .select({ organizationId: scopedOrganization.id })
        .from(organizationClosures)
        .innerJoin(
          scopedOrganization,
          eq(organizationClosures.descendantId, scopedOrganization.id),
        )
        .where(and(
          inArray(organizationClosures.ancestorId, rootOrganizationIds),
          eq(scopedOrganization.isDelete, false),
        ));
      const organizationIds = uniqueSorted(scopeRows.map(row => row.organizationId));
      if (
        rootOrganizationIds.some(id => !organizationIds.includes(id))
        || carrierOrganizationIds.some(id => !organizationIds.includes(id))
      ) {
        return null;
      }

      return { rootOrganizationIds, organizationIds };
    },
  };
}

function uniqueSorted(values: readonly number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}
