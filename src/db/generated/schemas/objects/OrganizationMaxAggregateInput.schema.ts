import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  orgCode: z.literal(true).optional(),
  orgName: z.literal(true).optional(),
  parentId: z.literal(true).optional(),
  businessParentId: z.literal(true).optional(),
  path: z.literal(true).optional(),
  level: z.literal(true).optional(),
  orgType: z.literal(true).optional(),
  orderNum: z.literal(true).optional(),
  isVirtual: z.literal(true).optional(),
  isEntity: z.literal(true).optional(),
  status: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional()
}).strict();
export const OrganizationMaxAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationMaxAggregateInputType>;
export const OrganizationMaxAggregateInputObjectZodSchema = makeSchema();
