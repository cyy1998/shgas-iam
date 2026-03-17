import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  orgId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const PosOrgCompositionMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionMinOrderByAggregateInput>;
export const PosOrgCompositionMinOrderByAggregateInputObjectZodSchema = makeSchema();
