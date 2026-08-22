import type { DbClient } from "@iam/db";
import type {
  EffectiveOrganizationResponsibility,
  OrganizationResponsibilityResolver,
} from "@iam/organization-responsibility-resolution";
import type { EmploymentResponsibilitySnapshot } from "./profile.schema";
import type { UserProfileBuildDataset, UserProfileEffectiveRoleResolverPort } from "./user-profile-build.repository";
import {
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
} from "@iam/contracts";
import { organizationClosures, organizations } from "@iam/db/schema";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { compareCodes, groupItemsBy } from "./user-profile-build.helpers";
import { createUserProfileBuildRepository } from "./user-profile-build.repository";

export interface ProfileResponsibilityRow
  extends Omit<EmploymentResponsibilitySnapshot, "type"> {
  employmentId: number;
  typeCode: EffectiveOrganizationResponsibility["typeCode"];
}

export type ProfileBuildDataset = UserProfileBuildDataset & {
  responsibilityRows: ProfileResponsibilityRow[];
};

export interface ProfileBuildRepository {
  loadByUserIds: (
    userIds: number[],
    at: Date,
  ) => Promise<ProfileBuildDataset>;
}

export function createProfileBuildRepository(
  db: DbClient,
  roleAssignmentResolver: UserProfileEffectiveRoleResolverPort,
  responsibilityResolver: Pick<
    OrganizationResponsibilityResolver,
    "resolveEffectiveResponsibilities"
  >,
): ProfileBuildRepository {
  const baseRepository = createUserProfileBuildRepository(db, roleAssignmentResolver);
  return {
    async loadByUserIds(userIds, at) {
      const dataset = await baseRepository.loadByUserIds(userIds);
      const employmentIds = dataset.employments.map(employment => employment.id);
      const resolved = await responsibilityResolver.resolveEffectiveResponsibilities({
        employmentIds,
        at,
      });
      const identities = employmentIds.flatMap(employmentId =>
        (resolved.get(employmentId) ?? []).map(responsibility => ({
          employmentId,
          ...responsibility,
        })),
      );
      const targetOrganizationIds = unique(identities.map(row => row.targetOrganizationId));
      const targetPaths = await loadTargetOrganizationPaths(db, targetOrganizationIds);
      const typeByCode = new Map(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map(type => [type.code, type]));
      return {
        ...dataset,
        responsibilityRows: identities.map((identity) => {
          const type = typeByCode.get(identity.typeCode);
          const path = targetPaths.get(identity.targetOrganizationId);
          const target = path?.at(-1);
          if (
            type === undefined
            || path === undefined
            || target === undefined
            || target.id !== identity.targetOrganizationId
          ) {
            throw new Error("Organization Responsibility Snapshot reference is incomplete");
          }
          return {
            employmentId: identity.employmentId,
            typeCode: identity.typeCode,
            targetOrganization: {
              code: target.code,
              name: target.name,
              type: target.type,
              path: path.map(({ id: _id, ...node }) => node),
            },
          };
        }),
      };
    },
  };
}

async function loadTargetOrganizationPaths(db: DbClient, targetOrganizationIds: number[]) {
  if (targetOrganizationIds.length === 0)
    return new Map<number, ResponsibilityOrganizationNode[]>();

  const ancestor = alias(organizations, "user_profile_v2_responsibility_target_ancestor");
  const rows = await db
    .select({
      targetOrganizationId: organizationClosures.descendantId,
      id: ancestor.id,
      depth: organizationClosures.depth,
      code: ancestor.orgCode,
      name: ancestor.orgName,
      type: ancestor.orgType,
    })
    .from(organizationClosures)
    .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
    .where(inArray(organizationClosures.descendantId, targetOrganizationIds));
  const grouped = groupItemsBy(rows, row => row.targetOrganizationId);
  return new Map([...grouped].map(([targetOrganizationId, pathRows]) => [
    targetOrganizationId,
    pathRows
      .sort((left, right) => right.depth - left.depth || compareCodes(left.code, right.code))
      .map(({ targetOrganizationId: _targetOrganizationId, depth: _depth, ...node }) => node),
  ]));
}

type ResponsibilityOrganizationNode
  = EmploymentResponsibilitySnapshot["targetOrganization"]["path"][number] & { id: number };

function unique<T>(items: readonly T[]) {
  return [...new Set(items)];
}
