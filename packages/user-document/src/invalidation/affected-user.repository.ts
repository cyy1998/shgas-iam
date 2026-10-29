import type { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { EmploymentStatus } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { employments, organizationClosures } from "@iam/db/schema";
import { and, eq, inArray } from "drizzle-orm";

const SQL_TARGET_BATCH_SIZE = 1_000;

interface UserDocumentAffectedUserResolverPort {
  resolveAffectedUserIds: (input: { roleIds: readonly number[] }) => Promise<readonly number[]>;
}

export interface UserDocumentResponsibilityAffectedUserResolverPort {
  resolveHolderEmploymentIds: (input: {
    targetOrganizationIds: readonly number[];
    at: Date;
  }) => Promise<readonly number[]>;
  resolveHolderEmploymentIdsByTypes: (input: {
    typeCodes: readonly OrganizationResponsibilityTypeCode[];
    at: Date;
  }) => Promise<readonly number[]>;
}

export function createUserDocumentAffectedUserRepository(
  db: DbClient,
  roleAssignmentResolver: UserDocumentAffectedUserResolverPort,
  responsibilityResolver: UserDocumentResponsibilityAffectedUserResolverPort,
) {
  async function findByEmploymentIds(employmentIds: readonly number[]) {
    return await findInBatches(
      employmentIds,
      async (ids) =>
        await db.select({ userId: employments.userId }).from(employments).where(inArray(employments.id, ids)),
    );
  }

  return {
    async findByOrganizationIds(organizationIds: readonly number[]) {
      return await findInBatches(
        organizationIds,
        async (ids) =>
          await db
            .select({ userId: employments.userId })
            .from(organizationClosures)
            .innerJoin(employments, eq(employments.orgId, organizationClosures.descendantId))
            .where(
              and(
                inArray(organizationClosures.ancestorId, ids),
                eq(employments.status, EmploymentStatus.Enable),
                eq(employments.isDelete, false),
              ),
            ),
      );
    },

    async findByPositionIds(positionIds: readonly number[]) {
      return await findInBatches(
        positionIds,
        async (ids) =>
          await db
            .select({ userId: employments.userId })
            .from(employments)
            .where(
              and(
                inArray(employments.posId, ids),
                eq(employments.status, EmploymentStatus.Enable),
                eq(employments.isDelete, false),
              ),
            ),
      );
    },

    findByEmploymentIds,

    async findByRoleIds(roleIds: readonly number[]) {
      return [...(await roleAssignmentResolver.resolveAffectedUserIds({ roleIds }))];
    },

    async findResponsibilityHoldersByOrganizationIds(organizationIds: readonly number[], at: Date) {
      const employmentIds = await responsibilityResolver.resolveHolderEmploymentIds({
        targetOrganizationIds: organizationIds,
        at,
      });
      return await findByEmploymentIds(employmentIds);
    },

    async findResponsibilityHoldersByTypeCodes(typeCodes: readonly OrganizationResponsibilityTypeCode[], at: Date) {
      const employmentIds = await responsibilityResolver.resolveHolderEmploymentIdsByTypes({
        typeCodes,
        at,
      });
      return await findByEmploymentIds(employmentIds);
    },
  };
}

async function findInBatches(
  targetIds: readonly number[],
  load: (ids: number[]) => Promise<Array<{ userId: number }>>,
) {
  const ids = [...new Set(targetIds)];
  const userIds = new Set<number>();
  for (let offset = 0; offset < ids.length; offset += SQL_TARGET_BATCH_SIZE) {
    const rows = await load(ids.slice(offset, offset + SQL_TARGET_BATCH_SIZE));
    for (const row of rows) userIds.add(row.userId);
  }
  return [...userIds];
}
