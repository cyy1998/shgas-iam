import { createOrganizationResponsibilityResolver } from "@iam/assignment-resolution/organization-responsibility";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import {
  OrganizationResponsibilityTypeCode,
  RoleAssignmentTargetType,
  UserDocumentRebuildReason,
} from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { z } from "zod";
import { createUserDocumentAffectedUserRepository } from "./affected-user.repository";

const positiveId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const UserDocumentSourceChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("user"), userId: positiveId }),
  z.strictObject({ kind: z.literal("employment"), userId: positiveId }),
  z.strictObject({ kind: z.literal("organization-responsibility-assignment"), userId: positiveId }),
  z.strictObject({
    kind: z.literal("organization-responsibility-type"),
    typeCodes: z.array(z.enum(OrganizationResponsibilityTypeCode)),
  }),
  z.strictObject({ kind: z.literal("organization"), organizationId: positiveId }),
  z.strictObject({ kind: z.literal("position"), positionId: positiveId }),
  z.strictObject({ kind: z.literal("role"), roleId: positiveId }),
  z.strictObject({
    kind: z.literal("role-assignment"),
    targetType: z.enum(RoleAssignmentTargetType),
    targetId: positiveId,
  }),
]);
export const UserDocumentOutboxSourceSchema = z.strictObject({
  change: UserDocumentSourceChangeSchema,
  reason: z.enum(UserDocumentRebuildReason).optional(),
  requestId: z.string().min(1).max(128).optional(),
  traceId: z.string().min(1).max(128).optional(),
});
export type UserDocumentSourceChange = z.infer<typeof UserDocumentSourceChangeSchema>;
export type UserDocumentOutboxSource = z.infer<typeof UserDocumentOutboxSourceSchema>;

export function userDocumentSourceReason(kind: UserDocumentSourceChange["kind"]): UserDocumentRebuildReason {
  switch (kind) {
    case "user":
      return UserDocumentRebuildReason.UserUpdated;
    case "employment":
      return UserDocumentRebuildReason.EmploymentUpdated;
    case "organization":
      return UserDocumentRebuildReason.OrganizationUpdated;
    case "position":
      return UserDocumentRebuildReason.PositionUpdated;
    case "role":
    case "role-assignment":
      return UserDocumentRebuildReason.RoleUpdated;
    case "organization-responsibility-assignment":
    case "organization-responsibility-type":
      return UserDocumentRebuildReason.OrganizationResponsibilityAssignmentUpdated;
  }
}

export async function expandUserDocumentSource(db: DbClient, source: UserDocumentSourceChange, observedAt: Date) {
  const repository = createUserDocumentAffectedUserRepository(
    db,
    createRoleAssignmentResolver(db),
    createOrganizationResponsibilityResolver(db),
  );
  switch (source.kind) {
    case "user":
    case "employment":
    case "organization-responsibility-assignment":
      return [source.userId];
    case "organization":
      return [
        ...new Set([
          ...(await repository.findByOrganizationIds([source.organizationId])),
          ...(await repository.findResponsibilityHoldersByOrganizationIds([source.organizationId], observedAt)),
        ]),
      ];
    case "position":
      return await repository.findByPositionIds([source.positionId]);
    case "role":
      return await repository.findByRoleIds([source.roleId]);
    case "organization-responsibility-type":
      return await repository.findResponsibilityHoldersByTypeCodes(source.typeCodes, observedAt);
    case "role-assignment":
      switch (source.targetType) {
        case RoleAssignmentTargetType.Organization:
          return await repository.findByOrganizationIds([source.targetId]);
        case RoleAssignmentTargetType.Position:
          return await repository.findByPositionIds([source.targetId]);
        case RoleAssignmentTargetType.Employment:
          return await repository.findByEmploymentIds([source.targetId]);
      }
  }
}
