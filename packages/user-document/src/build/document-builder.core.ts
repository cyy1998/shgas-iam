import {
  EmploymentStatus,
  ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG,
  OrganizationReferenceSchema,
  OrganizationStatus,
  PositionStatus,
} from "@iam/contracts";
import type { Employment, User } from "@iam/db/schema";
import { type PublishedUserDocument, PublishedUserDocumentSchema, USER_DOCUMENT_SCHEMA_VERSION } from "../document";
import { UserDocumentSourceIntegrityError } from "./document-build.error";
import type { DocumentBuildDataset } from "./document-build.repository";
import { compareCodes, groupItemsBy } from "./user-document-build.helpers";
import type { UserDocumentBuildOrgPathRow } from "./user-document-build.repository";

export type UserDocumentEmploymentIntegrityFailureReason = "organization-not-effective" | "position-not-effective";
export class UserDocumentEmploymentIntegrityError extends UserDocumentSourceIntegrityError {
  readonly code = "USER_DOCUMENT_EMPLOYMENT_INTEGRITY_FAILED";
  constructor(
    readonly userId: number,
    readonly employmentId: number,
    readonly reason: UserDocumentEmploymentIntegrityFailureReason,
  ) {
    super(`User Document Employment integrity failed: ${reason}`);
    this.name = "UserDocumentEmploymentIntegrityError";
  }
}

export type DocumentBuildResult<TDocument = PublishedUserDocument> =
  | { userId: number; sourceVersion: string; status: "built"; document: TDocument }
  | { userId: number; sourceVersion: string; status: "failed"; error: unknown };

/** Source rows are already bound to one snapshot and one observation time by the caller. */
export function buildUserDocumentsFromDataset(
  dataset: DocumentBuildDataset,
  observedAt: Date,
  versions: ReadonlyMap<number, string>,
): PublishedUserDocument[] {
  return dataset.users.map(createDocumentAssembler(dataset, observedAt, versions));
}

export function buildUserDocumentResultsFromDataset(
  dataset: DocumentBuildDataset,
  observedAt: Date,
  versions: ReadonlyMap<number, string>,
): DocumentBuildResult[] {
  const users = new Map<number, User>();
  for (const user of dataset.users) {
    if (!versions.has(user.id)) throw new Error("Document build returned an unexpected user");
    if (users.has(user.id)) throw new Error("Document build returned a duplicate user");
    users.set(user.id, user);
  }
  const assemble = createDocumentAssembler(dataset, observedAt, versions);
  return [...versions].map(([userId, sourceVersion]) => {
    try {
      const user = users.get(userId);
      if (!user) throw new UserDocumentSourceIntegrityError("User Document source is missing");
      return { userId, sourceVersion, status: "built", document: assemble(user) };
    } catch (error) {
      return { userId, sourceVersion, status: "failed", error };
    }
  });
}

function createDocumentAssembler(
  dataset: DocumentBuildDataset,
  observedAt: Date,
  versions: ReadonlyMap<number, string>,
) {
  const employmentsByUser = groupItemsBy(dataset.employments, (row) => row.userId);
  const positions = new Map(dataset.positions.map((row) => [row.id, row]));
  const paths = groupItemsBy(dataset.orgPathRows, (row) => row.descendantId);
  const roles = groupItemsBy(dataset.roleRows, (row) => row.employmentId);
  const responsibilities = groupItemsBy(dataset.responsibilityRows, (row) => row.employmentId);
  const employmentIds = new Set(dataset.employments.map(({ id }) => id));
  if (dataset.responsibilityRows.some((row) => !employmentIds.has(row.employmentId)))
    throw new Error("Document responsibility references an unexpected Employment");
  const catalog = new Map(ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.map((entry) => [entry.code, entry]));
  return (user: User) => {
    const sourceVersion = versions.get(user.id);
    if (sourceVersion === undefined) throw new Error("Document build returned an unexpected user");
    const metadata = {
      userId: user.id,
      subjectIdentifier: user.subjectIdentifier,
      schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
      sourceVersion,
      publishedAt: observedAt,
    };
    if (user.isDelete) return PublishedUserDocumentSchema.parse({ ...metadata, document: null });
    const items = (employmentsByUser.get(user.id) ?? [])
      .filter(
        (employment) =>
          !employment.isDelete &&
          (employment.status === EmploymentStatus.Enable || employment.status === EmploymentStatus.Pause),
      )
      .map((employment) => {
        const position = positions.get(employment.posId);
        if (!position || position.status !== PositionStatus.Enable || position.isDelete)
          throw new UserDocumentEmploymentIntegrityError(user.id, employment.id, "position-not-effective");
        const path = paths.get(employment.orgId) ?? [];
        const target = path.find(({ id }) => id === employment.orgId);
        if (!target || target.status !== OrganizationStatus.Enable || target.isDelete)
          throw new UserDocumentEmploymentIntegrityError(user.id, employment.id, "organization-not-effective");
        const organization = toOrganizationReference(path, employment.orgId);
        const clientAuthorizations = [...groupItemsBy(roles.get(employment.id) ?? [], (row) => row.clientCode)]
          .sort(([left], [right]) => compareCodes(left, right))
          .map(([clientCode, rows]) => ({
            clientCode,
            roles: [...new Set(rows.map(({ roleCode }) => roleCode))].sort(compareCodes).map((code) => ({ code })),
          }));
        const seen = new Set<string>();
        const responsibilityItems = (responsibilities.get(employment.id) ?? [])
          .map((row) => {
            const type = catalog.get(row.typeCode);
            if (!type) throw new UserDocumentSourceIntegrityError("Document responsibility type is unknown");
            const identity = `${type.code}\0${row.targetOrganization.code}`;
            if (seen.has(identity))
              throw new UserDocumentSourceIntegrityError("Document responsibility contains a duplicate identity");
            seen.add(identity);
            return {
              order: type.displayOrder,
              type: { code: type.code, name: type.name },
              targetOrganization: row.targetOrganization,
            };
          })
          .sort(
            (left, right) =>
              left.order - right.order ||
              compareCodes(left.type.code, right.type.code) ||
              compareCodes(left.targetOrganization.code, right.targetOrganization.code),
          )
          .map(({ order: _order, ...item }) => item);
        return {
          employment,
          document: {
            isPrimary: employment.isPrimary,
            organization,
            position: { code: position.posCode, name: position.posName },
            responsibilities: responsibilityItems,
            clientAuthorizations,
          },
        };
      })
      .filter(({ employment }) => isEffective(employment, observedAt))
      .map(({ document }) => document)
      .sort(
        (left, right) =>
          Number(right.isPrimary) - Number(left.isPrimary) ||
          compareCodes(left.organization.code, right.organization.code) ||
          compareCodes(left.position.code, right.position.code),
      );
    return PublishedUserDocumentSchema.parse({
      ...metadata,
      document: {
        subjectIdentifier: user.subjectIdentifier,
        username: user.username,
        name: user.name,
        mobile: user.mobile,
        wxId: user.wxId,
        userType: user.userType,
        status: user.status,
        employments: items,
      },
    });
  };
}

function isEffective(employment: Employment, observedAt: Date) {
  return (
    employment.status === EmploymentStatus.Enable &&
    employment.startTime <= observedAt &&
    (employment.endTime === null || observedAt < employment.endTime)
  );
}

function toOrganizationReference(rows: UserDocumentBuildOrgPathRow[], targetId: number) {
  const path = [...rows].sort((left, right) => right.depth - left.depth);
  const target = path.at(-1);
  if (
    !target ||
    target.id !== targetId ||
    path.some(
      (node, index) =>
        node.depth !== path.length - index - 1 ||
        node.level !== index + 1 ||
        (index === 0 ? node.parentId !== -1 : node.parentId !== path[index - 1]!.id),
    ) ||
    new Set(path.map(({ id }) => id)).size !== path.length
  )
    throw new UserDocumentSourceIntegrityError("Document organization path is incomplete");
  return OrganizationReferenceSchema.parse({
    code: target.orgCode,
    name: target.orgName,
    type: target.orgType,
    path: path.map((node) => ({
      code: node.orgCode,
      name: node.orgName,
      type: node.orgType,
      level: node.level,
      distanceToTarget: node.depth,
    })),
  });
}
