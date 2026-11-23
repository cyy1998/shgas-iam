import type { ResolveHolderEmploymentIdsInput } from "@iam/assignment-resolution/organization-responsibility";
import type { OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { EmploymentStatus } from "@iam/contracts";
import type { CustomAttributeEntityType } from "@iam/contracts/custom-attributes";
import type { DbClient } from "@iam/db";
import { employments, organizationClosures, organizations, positions, users } from "@iam/db/schema";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray } from "drizzle-orm";
import { customAttributeKeyExists } from "../../custom-attributes";

const SQL_TARGET_BATCH_SIZE = 1_000;

interface UserDocumentAffectedUserResolverPort {
  resolveAffectedUserIds: (input: { roleIds: readonly number[] }) => Promise<readonly number[]>;
}

export interface UserDocumentResponsibilityAffectedUserResolverPort {
  resolveHolderEmploymentIds: (input: ResolveHolderEmploymentIdsInput) => Promise<readonly number[]>;
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

  async function findByDirectAssignment(match: SQL) {
    return await db
      .selectDistinct({ userId: employments.userId })
      .from(employments)
      .innerJoin(users, eq(users.id, employments.userId))
      .where(
        and(
          eq(users.isDelete, false),
          eq(employments.isDelete, false),
          eq(employments.status, EmploymentStatus.Enable),
          match,
        ),
      );
  }

  async function findResponsibilityHoldersByOrganizationIds(
    targetOrganizationIds: readonly number[],
    at: Date,
    includeDescendants = true,
  ) {
    const employmentIds = await responsibilityResolver.resolveHolderEmploymentIds({
      targetOrganizationIds,
      at,
      includeDescendants,
    });
    return await findByEmploymentIds(employmentIds);
  }

  async function findByOrganizationCustomAttributes(organizationIds: readonly number[], at: Date) {
    const directUsers = await findInBatches(organizationIds, (ids) =>
      findByDirectAssignment(inArray(employments.orgId, ids)),
    );
    const responsibilityHolders = await findResponsibilityHoldersByOrganizationIds(organizationIds, at, false);
    return [...new Set([...directUsers, ...responsibilityHolders])];
  }

  return {
    findByOrganizationCustomAttributes,

    async findByCustomAttributeDefinition(entityType: CustomAttributeEntityType, attributeCode: string, at: Date) {
      if (entityType === "user") {
        const rows = await db
          .select({ userId: users.id })
          .from(users)
          .where(and(eq(users.isDelete, false), customAttributeKeyExists(users.customAttributes, attributeCode)));
        return rows.map(({ userId }) => userId);
      }
      if (entityType === "organization") {
        const rows = await db
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            and(
              eq(organizations.isDelete, false),
              customAttributeKeyExists(organizations.customAttributes, attributeCode),
            ),
          );
        return await findByOrganizationCustomAttributes(
          rows.map(({ id }) => id),
          at,
        );
      }
      const rows = await findByDirectAssignment(
        inArray(
          employments.posId,
          db
            .select({ id: positions.id })
            .from(positions)
            .where(
              and(eq(positions.isDelete, false), customAttributeKeyExists(positions.customAttributes, attributeCode)),
            ),
        ),
      );
      return rows.map(({ userId }) => userId);
    },

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

    findResponsibilityHoldersByOrganizationIds,

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
