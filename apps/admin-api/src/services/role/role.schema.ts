import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { RoleAssignmentTargetType, RoleStatus } from "@iam/contracts";
import { insertRoleSchema, updateRoleSchema } from "@iam/db/schema";

export {
  RoleAssignmentDtoSchema,
  RoleAssignmentTargetSummaryDtoSchema,
  RoleClientSummaryDtoSchema,
  RoleDetailDtoSchema,
  RoleDtoSchema,
  RoleSchema,
  toRoleAssignmentDto,
  toRoleDetailDto,
  toRoleDto,
} from "@iam/domain/role";

export const RolePaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "admin" }),
    }),
    exactConditions: z.object({
      clientCode: z.string().optional().openapi({ example: "portal" }),
      status: z.enum(RoleStatus).optional().openapi({ example: RoleStatus.Enable }),
    }),
  }),
).openapi("RolePaginationQueryDto");

export const RoleCreateDtoSchema = z.object(insertRoleSchema.omit({ clientId: true }).shape).extend({
  clientCode: z.string().min(1).max(64).openapi({ example: "portal" }),
}).strict().openapi("RoleCreateDto");

export const RoleUpdateDtoSchema = z.object(updateRoleSchema.pick({
  roleName: true,
  description: true,
  status: true,
}).shape).strict().openapi("RoleUpdateDto");

export const RoleStatusUpdateDtoSchema = z.object({
  status: z.enum(RoleStatus),
}).openapi("RoleStatusUpdateDto");

export const RoleAssignmentPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "信息中心" }),
    }),
    exactConditions: z.object({
      targetType: z.enum(RoleAssignmentTargetType).optional().openapi({
        example: RoleAssignmentTargetType.Organization,
      }),
      includeDescendants: z.boolean().optional().openapi({ example: true }),
    }),
  }),
).openapi("RoleAssignmentPaginationQueryDto");

export const RoleAssignmentCreateDtoSchema = z.object({
  targetType: z.enum(RoleAssignmentTargetType),
  orgCode: z.string().min(1).max(128).optional().openapi({ example: "SR" }),
  posCode: z.string().min(1).max(64).optional().openapi({ example: "P001" }),
  employmentId: z.number().int().positive().optional().openapi({ example: 1001 }),
  includeDescendants: z.boolean().optional().openapi({ example: true }),
}).strict().superRefine((dto, ctx) => {
  if (dto.targetType === RoleAssignmentTargetType.Organization && dto.orgCode === undefined) {
    ctx.addIssue({ code: "custom", path: ["orgCode"], message: "组织分配必须提供 orgCode" });
  }
  if (dto.targetType === RoleAssignmentTargetType.Position && dto.posCode === undefined) {
    ctx.addIssue({ code: "custom", path: ["posCode"], message: "岗位分配必须提供 posCode" });
  }
  if (dto.targetType === RoleAssignmentTargetType.Employment && dto.employmentId === undefined) {
    ctx.addIssue({ code: "custom", path: ["employmentId"], message: "任职分配必须提供 employmentId" });
  }
  if (dto.targetType !== RoleAssignmentTargetType.Organization && dto.includeDescendants === true) {
    ctx.addIssue({ code: "custom", path: ["includeDescendants"], message: "includeDescendants 仅适用于组织分配" });
  }
}).openapi("RoleAssignmentCreateDto");

export const RoleAssignmentScopeUpdateDtoSchema = z.object({
  includeDescendants: z.boolean(),
}).openapi("RoleAssignmentScopeUpdateDto");
