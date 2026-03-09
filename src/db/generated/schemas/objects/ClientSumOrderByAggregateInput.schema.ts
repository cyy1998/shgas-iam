import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const ClientSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.ClientSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientSumOrderByAggregateInput>;
export const ClientSumOrderByAggregateInputObjectZodSchema = makeSchema();
