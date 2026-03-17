import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  ancestorId: SortOrderSchema.optional(),
  descendantId: SortOrderSchema.optional(),
  depth: SortOrderSchema.optional()
}).strict();
export const OrganizationClosureSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureSumOrderByAggregateInput>;
export const OrganizationClosureSumOrderByAggregateInputObjectZodSchema = makeSchema();
