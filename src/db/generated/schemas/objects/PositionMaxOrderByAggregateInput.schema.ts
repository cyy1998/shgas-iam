import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posCode: SortOrderSchema.optional(),
  posName: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const PositionMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PositionMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionMaxOrderByAggregateInput>;
export const PositionMaxOrderByAggregateInputObjectZodSchema = makeSchema();
