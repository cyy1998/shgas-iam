import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { OrganizationClosureCountOrderByAggregateInputObjectSchema as OrganizationClosureCountOrderByAggregateInputObjectSchema } from './OrganizationClosureCountOrderByAggregateInput.schema';
import { OrganizationClosureAvgOrderByAggregateInputObjectSchema as OrganizationClosureAvgOrderByAggregateInputObjectSchema } from './OrganizationClosureAvgOrderByAggregateInput.schema';
import { OrganizationClosureMaxOrderByAggregateInputObjectSchema as OrganizationClosureMaxOrderByAggregateInputObjectSchema } from './OrganizationClosureMaxOrderByAggregateInput.schema';
import { OrganizationClosureMinOrderByAggregateInputObjectSchema as OrganizationClosureMinOrderByAggregateInputObjectSchema } from './OrganizationClosureMinOrderByAggregateInput.schema';
import { OrganizationClosureSumOrderByAggregateInputObjectSchema as OrganizationClosureSumOrderByAggregateInputObjectSchema } from './OrganizationClosureSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  ancestorId: SortOrderSchema.optional(),
  descendantId: SortOrderSchema.optional(),
  depth: SortOrderSchema.optional(),
  _count: z.lazy(() => OrganizationClosureCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => OrganizationClosureAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => OrganizationClosureMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => OrganizationClosureMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => OrganizationClosureSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const OrganizationClosureOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.OrganizationClosureOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureOrderByWithAggregationInput>;
export const OrganizationClosureOrderByWithAggregationInputObjectZodSchema = makeSchema();
