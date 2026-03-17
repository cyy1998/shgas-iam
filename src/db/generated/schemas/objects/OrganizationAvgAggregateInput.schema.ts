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
export const OrganizationAvgAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationAvgAggregateInputType>;
export const OrganizationAvgAggregateInputObjectZodSchema = makeSchema();
