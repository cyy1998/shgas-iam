import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { ClientCountOrderByAggregateInputObjectSchema as ClientCountOrderByAggregateInputObjectSchema } from './ClientCountOrderByAggregateInput.schema';
import { ClientAvgOrderByAggregateInputObjectSchema as ClientAvgOrderByAggregateInputObjectSchema } from './ClientAvgOrderByAggregateInput.schema';
import { ClientMaxOrderByAggregateInputObjectSchema as ClientMaxOrderByAggregateInputObjectSchema } from './ClientMaxOrderByAggregateInput.schema';
import { ClientMinOrderByAggregateInputObjectSchema as ClientMinOrderByAggregateInputObjectSchema } from './ClientMinOrderByAggregateInput.schema';
import { ClientSumOrderByAggregateInputObjectSchema as ClientSumOrderByAggregateInputObjectSchema } from './ClientSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  clientCode: SortOrderSchema.optional(),
  clientName: SortOrderSchema.optional(),
  clientSecret: SortOrderSchema.optional(),
  url: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  extAttributes: SortOrderSchema.optional(),
  _count: z.lazy(() => ClientCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => ClientAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => ClientMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => ClientMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => ClientSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const ClientOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.ClientOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientOrderByWithAggregationInput>;
export const ClientOrderByWithAggregationInputObjectZodSchema = makeSchema();
