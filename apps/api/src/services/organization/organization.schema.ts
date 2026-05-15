import { z } from "@hono/zod-openapi";
import { OrganizationLevel, OrganizationStatus, OrganizationType } from "@iam/contracts";
import { selectOrganizationSchema } from "@iam/db/schema";

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

export function toOrganizationDto(input: unknown) {
  const { parent, children, ...org } = OrganizationDetailSchema.parse(input);
  return OrganizationDtoSchema.parse({
    ...org,
    isLeaf: children.length === 0,
    parentCode: parent?.orgCode ?? null,
    parentName: parent?.orgName ?? null,
  });
}

export const OrganizationCreateDtoSchema = OrganizationSchema.partial().required({
  orgCode: true,
  orgType: true,
  orgName: true,
  // parentCode: true,
}).extend({
  path: z.string().default(""),
  level: z.enum(OrganizationLevel).default(OrganizationLevel.One),
  parentCode: z.string().nullish().openapi({ example: "SR" }),
}).omit({
  id: true,
  isDelete: true,
  createTime: true,
  updateTime: true,
  parentId: true,
}).openapi("OrganizationCreateDto");

export const OrganizationQueryDtoSchema = z.object({
  orgTypes: z.array(z.enum(OrganizationType)).optional().openapi({
    example: [OrganizationType.Department, OrganizationType.Company],
  }),
  orgLevels: z.array(z.enum(OrganizationLevel)).optional().openapi({
    example: [OrganizationLevel.One, OrganizationLevel.Two],
  }),
  ancestorCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
  ancestorDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  descendantCodes: z.array(z.string()).optional().openapi({ example: ["SR01", "SB01"] }),
  descendantDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  orgCodes: z.array(z.string()).optional().openapi({ example: ["SR", "SB"] }),
}).openapi("OrganizationQueryDto");

export const OrganizationUpdateDtoSchema = z.object({
  orgCode: z.string().min(1).optional(),
  orgName: z.string().min(1).optional(),
  orgType: z.enum(OrganizationType).optional(),
  status: z.enum(OrganizationStatus).optional(),
}).openapi("OrganizationUpdateDto");
