import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { AdminEmploymentAllowedActions } from "@iam/contracts";
import { EmploymentDetailDtoSchema } from "@admin-api/services/employment/employment.schema";
import { UserDetailDtoSchema, UserDtoSchema } from "@admin-api/services/user/user.schema";
import { z } from "@hono/zod-openapi";
import {
  AdminEmploymentAllowedActionsSchema,
  AdminUserAllowedActionsSchema,
  EmploymentStatus,
  userStatusToString,
} from "@iam/contracts";

const resourceOutOfScopeDecision = {
  allowed: false,
  reason: "RESOURCE_OUT_OF_SCOPE",
} as const;

const outOfScopeEmploymentAllowedActions = {
  editDescription: resourceOutOfScopeDecision,
  pause: resourceOutOfScopeDecision,
  resume: resourceOutOfScopeDecision,
  end: resourceOutOfScopeDecision,
  transfer: resourceOutOfScopeDecision,
  setPrimary: resourceOutOfScopeDecision,
  clearPrimary: resourceOutOfScopeDecision,
} satisfies AdminEmploymentAllowedActions;

export const UserVoSchema = UserDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("UserVo");

export function toUserVo(input: unknown) {
  const dto = UserDtoSchema.parse(input);
  return UserVoSchema.parse({
    ...dto,
    statusText: userStatusToString[dto.status],
  });
}

export const UserDetailVoSchema = UserVoSchema.extend({
  allowedActions: AdminUserAllowedActionsSchema,
  employments: z.array(EmploymentDetailDtoSchema.extend({
    allowedActions: AdminEmploymentAllowedActionsSchema,
    managementPath: z.string().nullable(),
  })),
  privileges: z.array(z.string()).openapi({ example: ["ui:button:tender:create-GYBG"] }),
  roles: z.array(z.string()).openapi({ example: ["tender:default-user"] }),
}).openapi("UserDetailVo");

export function toUserDetailVo(
  input: unknown,
  allowedActions: unknown,
  employmentAuthorization: AdminEmploymentAuthorization,
) {
  const dto = UserDetailDtoSchema.parse(input);
  return UserDetailVoSchema.parse({
    ...dto,
    allowedActions,
    employments: dto.employments.map((employment) => {
      const isInScope = employmentAuthorization.kind === "full"
        || employmentAuthorization.organizationIds.includes(employment.orgId);
      return {
        ...employment,
        allowedActions: isInScope
          ? employmentAuthorization.getAllowedActions({
              status: employment.status,
              isPrimary: employment.isPrimary,
            })
          : outOfScopeEmploymentAllowedActions,
        managementPath: isInScope
          && employment.status !== EmploymentStatus.Disable
          ? `/employments?employmentId=${employment.id}`
          : null,
      };
    }),
    statusText: userStatusToString[dto.status],
  });
}
