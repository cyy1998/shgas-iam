import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { LoginLogCountOrderByAggregateInputObjectSchema as LoginLogCountOrderByAggregateInputObjectSchema } from './LoginLogCountOrderByAggregateInput.schema';
import { LoginLogAvgOrderByAggregateInputObjectSchema as LoginLogAvgOrderByAggregateInputObjectSchema } from './LoginLogAvgOrderByAggregateInput.schema';
import { LoginLogMaxOrderByAggregateInputObjectSchema as LoginLogMaxOrderByAggregateInputObjectSchema } from './LoginLogMaxOrderByAggregateInput.schema';
import { LoginLogMinOrderByAggregateInputObjectSchema as LoginLogMinOrderByAggregateInputObjectSchema } from './LoginLogMinOrderByAggregateInput.schema';
import { LoginLogSumOrderByAggregateInputObjectSchema as LoginLogSumOrderByAggregateInputObjectSchema } from './LoginLogSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  username: SortOrderSchema.optional(),
  name: SortOrderSchema.optional(),
  clientCode: SortOrderSchema.optional(),
  loginType: SortOrderSchema.optional(),
  loginTime: SortOrderSchema.optional(),
  _count: z.lazy(() => LoginLogCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => LoginLogAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => LoginLogMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => LoginLogMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => LoginLogSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const LoginLogOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.LoginLogOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogOrderByWithAggregationInput>;
export const LoginLogOrderByWithAggregationInputObjectZodSchema = makeSchema();
