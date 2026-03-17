import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  ancestorId: SortOrderSchema.optional(),
  descendantId: SortOrderSchema.optional(),
  depth: SortOrderSchema.optional()
}).strict();
export const OrganizationClosureCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureCountOrderByAggregateInput>;
export const OrganizationClosureCountOrderByAggregateInputObjectZodSchema = makeSchema();
