import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  orderNum: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const UserAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.UserAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.UserAvgOrderByAggregateInput>;
export const UserAvgOrderByAggregateInputObjectZodSchema = makeSchema();
