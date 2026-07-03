import type { RoleStatus } from "@iam/contracts";
import {
  RoleAssignmentDtoSchema,
  RoleDetailDtoSchema,
  RoleDtoSchema,
} from "@admin-api/services/role/role.schema";
import { z } from "@hono/zod-openapi";
import { RoleAssignmentTargetType, roleStatusToString } from "@iam/contracts";

export const RoleVoSchema = RoleDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("RoleVo");

export function toRoleVo(input: unknown) {
  const dto = RoleDtoSchema.parse(input);
  return RoleVoSchema.parse({
    ...dto,
    statusText: roleStatusToString[dto.status as RoleStatus],
  });
}

export const RoleDetailVoSchema = RoleDetailDtoSchema.extend({
  statusText: z.string().openapi({ example: "正常" }),
}).openapi("RoleDetailVo");

export function toRoleDetailVo(input: unknown) {
  const dto = RoleDetailDtoSchema.parse(input);
  return RoleDetailVoSchema.parse({
    ...dto,
    statusText: roleStatusToString[dto.status as RoleStatus],
  });
}

const targetTypeText: Record<RoleAssignmentTargetType, string> = {
  [RoleAssignmentTargetType.Organization]: "组织",
  [RoleAssignmentTargetType.Position]: "岗位",
  [RoleAssignmentTargetType.Employment]: "任职",
};

export const RoleAssignmentVoSchema = RoleAssignmentDtoSchema.extend({
  targetTypeText: z.string().openapi({ example: "组织" }),
  scopeText: z.string().openapi({ example: "含下级组织" }),
}).openapi("RoleAssignmentVo");

export function toRoleAssignmentVo(input: unknown) {
  const dto = RoleAssignmentDtoSchema.parse(input);
  return RoleAssignmentVoSchema.parse({
    ...dto,
    targetTypeText: targetTypeText[dto.targetType as RoleAssignmentTargetType],
    scopeText: dto.targetType === RoleAssignmentTargetType.Organization
      ? dto.includeDescendants ? "含下级组织" : "仅本组织"
      : "仅当前对象",
  });
}
