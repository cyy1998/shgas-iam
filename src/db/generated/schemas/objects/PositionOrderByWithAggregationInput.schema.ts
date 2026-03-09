import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { PositionCountOrderByAggregateInputObjectSchema as PositionCountOrderByAggregateInputObjectSchema } from './PositionCountOrderByAggregateInput.schema';
import { PositionAvgOrderByAggregateInputObjectSchema as PositionAvgOrderByAggregateInputObjectSchema } from './PositionAvgOrderByAggregateInput.schema';
import { PositionMaxOrderByAggregateInputObjectSchema as PositionMaxOrderByAggregateInputObjectSchema } from './PositionMaxOrderByAggregateInput.schema';
import { PositionMinOrderByAggregateInputObjectSchema as PositionMinOrderByAggregateInputObjectSchema } from './PositionMinOrderByAggregateInput.schema';
import { PositionSumOrderByAggregateInputObjectSchema as PositionSumOrderByAggregateInputObjectSchema } from './PositionSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posCode: SortOrderSchema.optional(),
  posName: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => PositionCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PositionAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PositionMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PositionMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PositionSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PositionOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PositionOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionOrderByWithAggregationInput>;
export const PositionOrderByWithAggregationInputObjectZodSchema = makeSchema();
