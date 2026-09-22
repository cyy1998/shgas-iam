import { z } from "@hono/zod-openapi";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { selectOrganizationSchema } from "@iam/db/schema";

export const OrganizationSchema = z.object(selectOrganizationSchema.shape);

export const OrganizationDetailSchema = OrganizationSchema.extend({
  parent: OrganizationSchema.nullable(),
  children: z.array(OrganizationSchema),
});

export const OrganizationDtoSchema = OrganizationSchema.pick({
  id: true,
  orgCode: true,
  orgName: true,
  parentId: true,
  businessParentId: true,
  path: true,
  level: true,
  orgType: true,
  orderNum: true,
  isVirtual: true,
  isEntity: true,
  status: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
}).extend({
  isLeaf: z.boolean().openapi({ example: true }),
  parentCode: z.string().nullable().openapi({ example: "SR" }),
  parentName: z.string().nullable().openapi({ example: "上海燃气有限公司" }),
}).required().openapi("OrganizationDto");

export function toOrganizationDto(input: unknown) {
  const { parent, children, ...org } = OrganizationDetailSchema.parse(input);
  return OrganizationDtoSchema.parse({
    ...org,
    isLeaf: children.length === 0,
    parentCode: parent?.orgCode ?? null,
    parentName: parent?.orgName ?? null,
  });
}

const OrganizationCodeWriteSchema = z.string()
  .trim()
  .min(1, "组织编码不能为空")
  .max(64, "组织编码最多64个字符")
  .openapi({ description: "组织编码" });

const OrganizationNameWriteSchema = z.string()
  .trim()
  .min(1, "组织名称不能为空")
  .openapi({ description: "组织名称" });

export const OrganizationCreateDtoSchema = OrganizationSchema.pick({
  orgCode: true,
  orgName: true,
  businessParentId: true,
  path: true,
  level: true,
  orgType: true,
  orderNum: true,
  isVirtual: true,
  isEntity: true,
  status: true,
}).partial().required({
  orgCode: true,
  orgType: true,
  orgName: true,
}).extend({
  orgCode: OrganizationCodeWriteSchema,
  orgName: OrganizationNameWriteSchema,
  status: z.literal(OrganizationStatus.Enable).default(OrganizationStatus.Enable),
  path: z.string().default(""),
  level: z.enum(OrganizationLevel).default(OrganizationLevel.One),
  parentCode: z.string().nullish().openapi({ example: "SR" }),
}).openapi("OrganizationCreateDto");

export const OrganizationUpdateDtoSchema = z.object({
  orgCode: OrganizationCodeWriteSchema.optional(),
  orgName: OrganizationNameWriteSchema.optional(),
  orgType: z.enum(OrganizationType).optional(),
  status: z.enum(OrganizationStatus).optional(),
}).strict().openapi("OrganizationUpdateDto");
