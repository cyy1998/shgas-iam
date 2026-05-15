import { z } from "@hono/zod-openapi";
import { createPageQuerySchema } from "@iam/api-core/core/pagination/schema";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";

export {
  OrganizationCreateDtoSchema,
  OrganizationDetailSchema,
  OrganizationDtoSchema,
  OrganizationSchema,
  OrganizationUpdateDtoSchema,
  toOrganizationDto,
} from "@iam/domain/organization";

export const OrganizationPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "上海" }),
    }),
    exactConditions: z.object({
      orgType: z.enum(OrganizationType).optional().openapi({ example: OrganizationType.Department }),
      status: z.enum(OrganizationStatus).optional().openapi({ example: OrganizationStatus.Enable }),
      parentOrgCode: z.string().optional().openapi({ example: "SR" }),
      ancestorOrgCode: z.string().optional().openapi({
        example: "SR",
        description: "按祖先 orgCode 过滤（闭包表，匹配任意深度后代，不含自身）",
      }),
    }),
  }),
).openapi("OrganizationPaginationQueryDto");

export const OrganizationStatusUpdateDtoSchema = z.object({
  status: z.enum(OrganizationStatus),
}).openapi("OrganizationStatusUpdateDto");

export const OrganizationTreeNodeDtoSchema = z.object({
  id: z.number(),
  orgCode: z.string(),
  orgName: z.string(),
  orgType: z.enum(OrganizationType),
  status: z.enum(OrganizationStatus),
  level: z.enum(OrganizationLevel),
  parentId: z.number(),
  orderNum: z.number(),
  isLeaf: z.boolean(),
}).openapi("OrganizationTreeNodeDto");

export const OrganizationChildrenQueryDtoSchema = z.object({
  parentOrgCode: z.string().nullish().openapi({ example: "SR" }),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().max(500).default(50),
}).openapi("OrganizationChildrenQueryDto");
