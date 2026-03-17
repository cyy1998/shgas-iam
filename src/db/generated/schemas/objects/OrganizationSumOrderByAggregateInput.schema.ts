import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  parentId: SortOrderSchema.optional(),
  businessParentId: SortOrderSchema.optional(),
  level: SortOrderSchema.optional(),
  orderNum: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const OrganizationSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationSumOrderByAggregateInput>;
export const OrganizationSumOrderByAggregateInputObjectZodSchema = makeSchema();
