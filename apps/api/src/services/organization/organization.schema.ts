import { OrganizationStatus } from "@api/enums/organization.status";
import { z } from "@hono/zod-openapi";
import { selectOrganizationSchema } from "@iam/db/schema";
import { createPageQuerySchema } from "../../lib/core/pagination/schema";

export const OrganizationSchema = z.object(selectOrganizationSchema.shape);

export const OrganizationDetailSchema = OrganizationSchema.extend({
  parent: OrganizationSchema.nullable(),
  children: z.array(OrganizationSchema),
});

export const OrganizationDtoSchema = OrganizationSchema.extend({
  isLeaf: z.boolean().openapi({ example: true }),
  parentCode: z.string().nullable().openapi({ example: "SR" }),
  parentName: z.string().nullable().openapi({ example: "上海燃气有限公司" }),
}).required().openapi("OrganizationDto");

export const OrganizationDtoConverterSchema = OrganizationDetailSchema.transform((e) => {
  const { parent, children, ...org } = e;
  return {
    ...org,
    isLeaf: e.children.length === 0,
    parentCode: e.parent?.orgCode ?? null,
    parentName: e.parent?.orgName ?? null,
  };
}).pipe(OrganizationDtoSchema);

export const OrganizationCreateDtoSchema = OrganizationSchema.partial().required({
  orgCode: true,
  orgType: true,
  orgName: true,
  // parentCode: true,
}).extend({
  path: z.string().default(""),
  level: z.number().default(0),
  parentCode: z.string().nullish().openapi({ example: "SR" }),
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  parentId: true,
}).openapi("OrganizationCreateDto");

export const OrganizationQueryDtoSchema = z.object({
  orgTypes: z.array(z.string()).optional().openapi({ example: ["部门", "分公司"] }),
  orgLevels: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  ancestorCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  ancestorDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  descendantCodes: z.array(z.string()).optional().openapi({ example: ["SR01", "SB01"] }),
  descendantDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  orgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
}).openapi("OrganizationQueryDto");

export const OrganizationPaginationQueryDtoSchema = createPageQuerySchema(
  z.object({
    fuzzyConditions: z.object({
      text: z.string().optional().openapi({ example: "上海" }),
    }),
    exactConditions: z.object({
      orgType: z.string().optional().openapi({ example: "部门" }),
      status: z.number().optional().openapi({ example: 1 }),
      parentOrgCode: z.string().optional().openapi({ example: "SR" }),
      ancestorOrgCode: z.string().optional().openapi({
        example: "SR",
        description: "按祖先 orgCode 过滤（闭包表，匹配任意深度后代，不含自身）",
      }),
    }),
  }),
).openapi("OrganizationPaginationQueryDto");

export const OrganizationUpdateDtoSchema = z.object({
  orgCode: z.string().min(1).optional(),
  orgName: z.string().min(1).optional(),
  orgType: z.string().min(1).optional(),
  status: z.enum(OrganizationStatus).optional(),
}).openapi("OrganizationUpdateDto");

export const OrganizationStatusUpdateDtoSchema = z.object({
  status: z.enum(OrganizationStatus),
}).openapi("OrganizationStatusUpdateDto");

export const OrganizationTreeNodeDtoSchema = z.object({
  id: z.number(),
  orgCode: z.string(),
  orgName: z.string(),
  orgType: z.string(),
  status: z.number(),
  level: z.number(),
  parentId: z.number(),
  orderNum: z.number(),
  isLeaf: z.boolean(),
}).openapi("OrganizationTreeNodeDto");

export const OrganizationChildrenQueryDtoSchema = z.object({
  parentOrgCode: z.string().nullish().openapi({ example: "SR" }),
  pageNum: z.int().positive().default(1),
  pageSize: z.int().positive().max(500).default(50),
}).openapi("OrganizationChildrenQueryDto");
