import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { DelegationDetailCountOrderByAggregateInputObjectSchema as DelegationDetailCountOrderByAggregateInputObjectSchema } from './DelegationDetailCountOrderByAggregateInput.schema';
import { DelegationDetailAvgOrderByAggregateInputObjectSchema as DelegationDetailAvgOrderByAggregateInputObjectSchema } from './DelegationDetailAvgOrderByAggregateInput.schema';
import { DelegationDetailMaxOrderByAggregateInputObjectSchema as DelegationDetailMaxOrderByAggregateInputObjectSchema } from './DelegationDetailMaxOrderByAggregateInput.schema';
import { DelegationDetailMinOrderByAggregateInputObjectSchema as DelegationDetailMinOrderByAggregateInputObjectSchema } from './DelegationDetailMinOrderByAggregateInput.schema';
import { DelegationDetailSumOrderByAggregateInputObjectSchema as DelegationDetailSumOrderByAggregateInputObjectSchema } from './DelegationDetailSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  delegationId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional(),
  _count: z.lazy(() => DelegationDetailCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => DelegationDetailAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => DelegationDetailMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => DelegationDetailMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => DelegationDetailSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const DelegationDetailOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.DelegationDetailOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailOrderByWithAggregationInput>;
export const DelegationDetailOrderByWithAggregationInputObjectZodSchema = makeSchema();
