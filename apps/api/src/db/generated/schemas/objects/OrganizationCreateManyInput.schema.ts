import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.number().int().optional(),
  orgCode: z.string(),
  orgName: z.string(),
  parentId: z.number().int().optional(),
  businessParentId: z.number().int().optional(),
  path: z.string(),
  level: z.number().int(),
  orgType: z.string(),
  orderNum: z.number().int().optional(),
  isVirtual: z.boolean().optional(),
  isEntity: z.boolean().optional(),
  status: z.number().int().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const OrganizationCreateManyInputObjectSchema: z.ZodType<Prisma.OrganizationCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationCreateManyInput>;
export const OrganizationCreateManyInputObjectZodSchema = makeSchema();
