import type { Prisma } from '@prisma-client/client';
import { z } from '@hono/zod-openapi';

export type OrganizationEntity = Prisma.OrganizationGetPayload<{
  include: {
    parent: true;
    children: true;
  };

}>;

export const OrganizationDtoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  orgCode: z.string().openapi({ example: 'SR23' }),
  orgName: z.string().openapi({ example: '信息中心' }),
  orgType: z.string().openapi({ example: '组织类型' }),
  level: z.number().openapi({ example: 2 }),
  parentId: z.number().nullable().openapi({ example: -1 }),
  isLeaf: z.boolean().openapi({ example: true }),
  parentCode: z.string().nullable().openapi({ example: 'SR' }),
  parentName: z.string().nullable().openapi({ example: '上海燃气有限公司' }),
  // parentId: z.number().openapi({ example: 1 })
}).openapi('OrganizationDto');

export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>;

export const OrganizationCreateDtoSchema = OrganizationDtoSchema.partial().required({
  orgCode: true,
  orgType: true,
  orgName: true,
}).extend({
  parentCode: z.string().openapi({ example: 'SR' }),
}).openapi('OrganizationCreateDto');

export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>;

export const FormalOrganizationVoSchema = z.object({
  id: z.number().openapi({ example: 1 }),
  orgCode: z.string().openapi({ example: 'SR23' }),
  orgName: z.string().openapi({ example: '信息中心' }),
  orgType: z.string().openapi({ example: '组织类型' }),
  level: z.number().openapi({ example: 2 }),
  compCode: z.string().openapi({ example: 'SR' }),
  compName: z.string().openapi({ example: '上海燃气' }),
});

export type FormalOrganizationVo = z.infer<typeof FormalOrganizationVoSchema>;

export const OrganizationQueryDtoSchema = z.object({
  orgTypes: z.array(z.string()).optional().openapi({ example: ['部门', '分公司'] }),
  orgLevels: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  ancestorCodes: z.array(z.string()).optional().openapi({ example: ['SR', 'SB'] }),
  ancestorDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  descendantCodes: z.array(z.string()).optional().openapi({ example: ['SR01', 'SB01'] }),
  descendantDepths: z.array(z.number()).optional().openapi({ example: [1, 2] }),
  orgCodes: z.array(z.string()).optional().openapi({ example: ['SR', 'SB'] }),
}).openapi('OrganizationQueryDto');

export type OrganizationQueryDto = z.infer<typeof OrganizationQueryDtoSchema>;
