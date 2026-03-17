import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { PosOrgCompositionCountOrderByAggregateInputObjectSchema as PosOrgCompositionCountOrderByAggregateInputObjectSchema } from './PosOrgCompositionCountOrderByAggregateInput.schema';
import { PosOrgCompositionAvgOrderByAggregateInputObjectSchema as PosOrgCompositionAvgOrderByAggregateInputObjectSchema } from './PosOrgCompositionAvgOrderByAggregateInput.schema';
import { PosOrgCompositionMaxOrderByAggregateInputObjectSchema as PosOrgCompositionMaxOrderByAggregateInputObjectSchema } from './PosOrgCompositionMaxOrderByAggregateInput.schema';
import { PosOrgCompositionMinOrderByAggregateInputObjectSchema as PosOrgCompositionMinOrderByAggregateInputObjectSchema } from './PosOrgCompositionMinOrderByAggregateInput.schema';
import { PosOrgCompositionSumOrderByAggregateInputObjectSchema as PosOrgCompositionSumOrderByAggregateInputObjectSchema } from './PosOrgCompositionSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  orgId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => PosOrgCompositionCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PosOrgCompositionAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PosOrgCompositionMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PosOrgCompositionMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PosOrgCompositionSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionOrderByWithAggregationInput>;
export const PosOrgCompositionOrderByWithAggregationInputObjectZodSchema = makeSchema();
