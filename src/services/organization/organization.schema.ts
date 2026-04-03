import { z } from "@hono/zod-openapi";
import { OrganizationSchema as PrismaOrganizationSchema } from "@/db/generated/schemas";

export const OrganizationSchema = z.object(PrismaOrganizationSchema.shape);

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

// export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;

export const OrganizationCreateDtoSchema = OrganizationDtoSchema.partial().required({
  orgCode: true,
  orgType: true,
  orgName: true,
  parentCode: true,
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
