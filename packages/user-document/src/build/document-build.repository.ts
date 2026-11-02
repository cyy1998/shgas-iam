import type { DocumentResponsibility } from "@iam/contracts";
import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { organizationClosures, organizations } from "@iam/db/schema";
import type {
  EffectiveOrganizationResponsibility,
  OrganizationResponsibilityResolver,
} from "@iam/organization-responsibility-resolution";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { UserDocumentSourceIntegrityError } from "./document-build.error";
import { compareCodes, groupItemsBy } from "./user-document-build.helpers";
import type { UserDocumentBuildDataset, UserDocumentEffectiveRoleResolverPort } from "./user-document-build.repository";
import { createUserDocumentBuildRepository } from "./user-document-build.repository";

export interface DocumentResponsibilityRow extends Omit<DocumentResponsibility, "type"> {
  employmentId: number;
  typeCode: EffectiveOrganizationResponsibility["typeCode"];
}

export type DocumentBuildDataset = UserDocumentBuildDataset & {
  responsibilityRows: DocumentResponsibilityRow[];
};

export interface DocumentBuildRepository {
  loadByUserIds: (userIds: number[], at: Date, signal?: AbortSignal) => Promise<DocumentBuildDataset>;
}

export function createDocumentBuildRepository(
  db: DbClient,
  roleAssignmentResolver: UserDocumentEffectiveRoleResolverPort,
  responsibilityResolver: Pick<OrganizationResponsibilityResolver, "resolveEffectiveResponsibilities">,
): DocumentBuildRepository {
  const baseRepository = createUserDocumentBuildRepository(db, roleAssignmentResolver);
  return {
    async loadByUserIds(userIds, at, signal) {
      signal?.throwIfAborted();
      const dataset = await baseRepository.loadByUserIds(userIds, signal);
      signal?.throwIfAborted();
      const employmentIds = dataset.employments.map((employment) => employment.id);
      const resolved = await responsibilityResolver.resolveEffectiveResponsibilities({
        employmentIds,
        at,
      });
      signal?.throwIfAborted();
      const identities = employmentIds.flatMap((employmentId) =>
        (resolved.get(employmentId) ?? []).map((responsibility) => ({
          employmentId,
          ...responsibility,
        })),
      );
      const targetOrganizationIds = unique(identities.map((row) => row.targetOrganizationId));
      const targetPaths = await loadTargetOrganizationPaths(db, targetOrganizationIds);
      signal?.throwIfAborted();
      const typeByCode = new Map(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((type) => [type.code, type]));
      return {
        ...dataset,
        responsibilityRows: identities.map((identity) => {
          const type = typeByCode.get(identity.typeCode);
          const path = targetPaths.get(identity.targetOrganizationId);
          const target = path?.at(-1);
          if (
            type === undefined ||
            path === undefined ||
            target === undefined ||
            target.id !== identity.targetOrganizationId
          ) {
            throw new UserDocumentSourceIntegrityError("Organization Responsibility Snapshot reference is incomplete");
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
  if (targetOrganizationIds.length === 0) return new Map<number, ResponsibilityOrganizationNode[]>();

  const ancestor = alias(organizations, "user_document_responsibility_target_ancestor");
  const rows = await db
    .select({
      targetOrganizationId: organizationClosures.descendantId,
      id: ancestor.id,
      depth: organizationClosures.depth,
      code: ancestor.orgCode,
      name: ancestor.orgName,
      type: ancestor.orgType,
      level: ancestor.level,
      parentId: ancestor.parentId,
    })
    .from(organizationClosures)
    .innerJoin(ancestor, eq(organizationClosures.ancestorId, ancestor.id))
    .where(inArray(organizationClosures.descendantId, targetOrganizationIds));
  const grouped = groupItemsBy(rows, (row) => row.targetOrganizationId);
  return new Map(
    [...grouped].map(([targetOrganizationId, pathRows]) => [
      targetOrganizationId,
      pathRows
        .sort((left, right) => right.depth - left.depth || compareCodes(left.code, right.code))
        .map(({ targetOrganizationId: _targetOrganizationId, depth, level, parentId, ...node }, index, path) => {
          if (
            depth !== path.length - index - 1 ||
            level !== index + 1 ||
            (index === 0 ? parentId !== -1 : parentId !== path[index - 1]?.id)
          ) {
            throw new UserDocumentSourceIntegrityError("Organization Responsibility Snapshot path is incomplete");
          }
          return {
            ...node,
            level,
            distanceToTarget: depth,
          };
        }),
    ]),
  );
}

type ResponsibilityOrganizationNode = DocumentResponsibility["targetOrganization"]["path"][number] & {
  id: number;
};

function unique<T>(items: readonly T[]) {
  return [...new Set(items)];
}
