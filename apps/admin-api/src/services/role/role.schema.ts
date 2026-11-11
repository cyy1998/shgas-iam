import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { GLOBAL_ROLE_PREFIX, isGlobalRoleCode, RoleAssignmentTargetType, RoleStatus, RoleType } from "@iam/contracts";
import { insertRoleSchema, updateRoleSchema } from "@iam/db/schema";
import { RoleClientSummaryDtoSchema, RoleDetailDtoSchema, RoleDtoSchema } from "@iam/domain/role";

export {
  RoleAssignmentDtoSchema,
  RoleAssignmentTargetSummaryDtoSchema,
  RoleClientSummaryDtoSchema,
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
      roleType: z.enum(RoleType).optional(),
      status: z.enum(RoleStatus).optional().openapi({ example: RoleStatus.Enable }),
    }),
  }),
).openapi("RolePaginationQueryDto");

const RoleCreateFieldsSchema = z.object(
  insertRoleSchema.pick({ roleCode: true, roleName: true, roleKind: true, status: true, description: true }).shape,
);

export const RoleCreateDtoSchema = z
  .union([
    RoleCreateFieldsSchema.extend({
      roleType: z.literal(RoleType.Client).optional(),
      clientCode: z.string().min(1).max(64).openapi({ example: "portal" }),
      roleCode: RoleCreateFieldsSchema.shape.roleCode.refine(
        (code) => !code.startsWith(GLOBAL_ROLE_PREFIX),
        "global: 前缀仅用于全局角色",
      ),
    }).strict(),
    RoleCreateFieldsSchema.extend({
      roleType: z.literal(RoleType.Global),
      roleCode: RoleCreateFieldsSchema.shape.roleCode.refine(
        isGlobalRoleCode,
        "全局角色编码必须包含 global: 前缀和非空后缀",
      ),
    }).strict(),
  ])
  .openapi("RoleCreateDto");

export const RoleInclusionEndpointDtoSchema = RoleDtoSchema.pick({
  id: true,
  roleCode: true,
  roleName: true,
  roleType: true,
  status: true,
}).extend({ client: RoleClientSummaryDtoSchema.nullable() });

export const AdminRoleDetailDtoSchema = RoleDetailDtoSchema.extend({
  members: z.array(RoleInclusionEndpointDtoSchema),
  containers: z.array(RoleInclusionEndpointDtoSchema),
}).openapi("AdminRoleDetailDto");

const RoleInclusionPatchSchema = z
  .strictObject({
    addRoleIds: z.array(z.int32().positive()),
    removeRoleIds: z.array(z.int32().positive()),
  })
  .refine(({ addRoleIds, removeRoleIds }) => {
    const removed = new Set(removeRoleIds);
    return !addRoleIds.some((id) => removed.has(id));
  }, "同一角色不能同时加入和移除");

export const RoleUpdateDtoSchema = z
  .object(
    updateRoleSchema.pick({
      roleName: true,
      description: true,
      status: true,
    }).shape,
  )
  .extend({ inclusions: RoleInclusionPatchSchema.optional() })
  .strict()
  .openapi("RoleUpdateDto");

export const RoleStatusUpdateDtoSchema = z
  .object({
    status: z.enum(RoleStatus),
  })
  .openapi("RoleStatusUpdateDto");

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

export const RoleAssignmentCreateDtoSchema = z
  .object({
    targetType: z.enum(RoleAssignmentTargetType),
    orgCode: z.string().min(1).max(128).optional().openapi({ example: "SR" }),
    posCode: z.string().min(1).max(64).optional().openapi({ example: "P001" }),
    employmentId: z.number().int().positive().optional().openapi({ example: 1001 }),
    includeDescendants: z.boolean().optional().openapi({ example: true }),
  })
  .strict()
  .superRefine((dto, ctx) => {
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
  })
  .openapi("RoleAssignmentCreateDto");

export const RoleAssignmentScopeUpdateDtoSchema = z
  .object({
    includeDescendants: z.boolean(),
  })
  .openapi("RoleAssignmentScopeUpdateDto");
