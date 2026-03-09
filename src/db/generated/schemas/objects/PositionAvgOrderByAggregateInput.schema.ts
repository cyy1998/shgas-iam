import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const PositionAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PositionAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionAvgOrderByAggregateInput>;
export const PositionAvgOrderByAggregateInputObjectZodSchema = makeSchema();
