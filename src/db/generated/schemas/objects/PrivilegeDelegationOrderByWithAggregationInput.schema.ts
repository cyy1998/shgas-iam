import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { PrivilegeDelegationCountOrderByAggregateInputObjectSchema as PrivilegeDelegationCountOrderByAggregateInputObjectSchema } from './PrivilegeDelegationCountOrderByAggregateInput.schema';
import { PrivilegeDelegationAvgOrderByAggregateInputObjectSchema as PrivilegeDelegationAvgOrderByAggregateInputObjectSchema } from './PrivilegeDelegationAvgOrderByAggregateInput.schema';
import { PrivilegeDelegationMaxOrderByAggregateInputObjectSchema as PrivilegeDelegationMaxOrderByAggregateInputObjectSchema } from './PrivilegeDelegationMaxOrderByAggregateInput.schema';
import { PrivilegeDelegationMinOrderByAggregateInputObjectSchema as PrivilegeDelegationMinOrderByAggregateInputObjectSchema } from './PrivilegeDelegationMinOrderByAggregateInput.schema';
import { PrivilegeDelegationSumOrderByAggregateInputObjectSchema as PrivilegeDelegationSumOrderByAggregateInputObjectSchema } from './PrivilegeDelegationSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  delegatorUserId: SortOrderSchema.optional(),
  delegateeUserId: SortOrderSchema.optional(),
  organizationScopeId: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => PrivilegeDelegationCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PrivilegeDelegationAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PrivilegeDelegationMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PrivilegeDelegationMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PrivilegeDelegationSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationOrderByWithAggregationInput>;
export const PrivilegeDelegationOrderByWithAggregationInputObjectZodSchema = makeSchema();
