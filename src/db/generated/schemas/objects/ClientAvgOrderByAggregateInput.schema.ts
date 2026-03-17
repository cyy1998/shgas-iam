import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const ClientAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.ClientAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientAvgOrderByAggregateInput>;
export const ClientAvgOrderByAggregateInputObjectZodSchema = makeSchema();
