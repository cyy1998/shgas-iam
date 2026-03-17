import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { RoleCountOrderByAggregateInputObjectSchema as RoleCountOrderByAggregateInputObjectSchema } from './RoleCountOrderByAggregateInput.schema';
import { RoleAvgOrderByAggregateInputObjectSchema as RoleAvgOrderByAggregateInputObjectSchema } from './RoleAvgOrderByAggregateInput.schema';
import { RoleMaxOrderByAggregateInputObjectSchema as RoleMaxOrderByAggregateInputObjectSchema } from './RoleMaxOrderByAggregateInput.schema';
import { RoleMinOrderByAggregateInputObjectSchema as RoleMinOrderByAggregateInputObjectSchema } from './RoleMinOrderByAggregateInput.schema';
import { RoleSumOrderByAggregateInputObjectSchema as RoleSumOrderByAggregateInputObjectSchema } from './RoleSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  roleCode: SortOrderSchema.optional(),
  roleName: SortOrderSchema.optional(),
  clientId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => RoleCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => RoleAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => RoleMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => RoleMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => RoleSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const RoleOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.RoleOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleOrderByWithAggregationInput>;
export const RoleOrderByWithAggregationInputObjectZodSchema = makeSchema();
