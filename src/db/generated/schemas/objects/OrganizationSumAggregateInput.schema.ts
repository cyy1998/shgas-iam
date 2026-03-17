import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  parentId: z.literal(true).optional(),
  businessParentId: z.literal(true).optional(),
  level: z.literal(true).optional(),
  orderNum: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const OrganizationSumAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationSumAggregateInputType>;
export const OrganizationSumAggregateInputObjectZodSchema = makeSchema();
