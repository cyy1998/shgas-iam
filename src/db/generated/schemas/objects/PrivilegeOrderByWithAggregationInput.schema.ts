import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { PrivilegeCountOrderByAggregateInputObjectSchema as PrivilegeCountOrderByAggregateInputObjectSchema } from './PrivilegeCountOrderByAggregateInput.schema';
import { PrivilegeAvgOrderByAggregateInputObjectSchema as PrivilegeAvgOrderByAggregateInputObjectSchema } from './PrivilegeAvgOrderByAggregateInput.schema';
import { PrivilegeMaxOrderByAggregateInputObjectSchema as PrivilegeMaxOrderByAggregateInputObjectSchema } from './PrivilegeMaxOrderByAggregateInput.schema';
import { PrivilegeMinOrderByAggregateInputObjectSchema as PrivilegeMinOrderByAggregateInputObjectSchema } from './PrivilegeMinOrderByAggregateInput.schema';
import { PrivilegeSumOrderByAggregateInputObjectSchema as PrivilegeSumOrderByAggregateInputObjectSchema } from './PrivilegeSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  privilegeCode: SortOrderSchema.optional(),
  privilegeName: SortOrderSchema.optional(),
  fieldValues: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  status: SortOrderSchema.optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => PrivilegeCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PrivilegeAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PrivilegeMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PrivilegeMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PrivilegeSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PrivilegeOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PrivilegeOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeOrderByWithAggregationInput>;
export const PrivilegeOrderByWithAggregationInputObjectZodSchema = makeSchema();
