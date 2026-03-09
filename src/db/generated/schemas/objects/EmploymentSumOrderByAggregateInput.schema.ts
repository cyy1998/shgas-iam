import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  deptId: SortOrderSchema.optional(),
  compId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const EmploymentSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentSumOrderByAggregateInput>;
export const EmploymentSumOrderByAggregateInputObjectZodSchema = makeSchema();
