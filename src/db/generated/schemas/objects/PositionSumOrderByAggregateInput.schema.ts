import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const PositionSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PositionSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionSumOrderByAggregateInput>;
export const PositionSumOrderByAggregateInputObjectZodSchema = makeSchema();
