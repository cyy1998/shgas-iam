import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { RolePrivilegeCountOrderByAggregateInputObjectSchema as RolePrivilegeCountOrderByAggregateInputObjectSchema } from './RolePrivilegeCountOrderByAggregateInput.schema';
import { RolePrivilegeAvgOrderByAggregateInputObjectSchema as RolePrivilegeAvgOrderByAggregateInputObjectSchema } from './RolePrivilegeAvgOrderByAggregateInput.schema';
import { RolePrivilegeMaxOrderByAggregateInputObjectSchema as RolePrivilegeMaxOrderByAggregateInputObjectSchema } from './RolePrivilegeMaxOrderByAggregateInput.schema';
import { RolePrivilegeMinOrderByAggregateInputObjectSchema as RolePrivilegeMinOrderByAggregateInputObjectSchema } from './RolePrivilegeMinOrderByAggregateInput.schema';
import { RolePrivilegeSumOrderByAggregateInputObjectSchema as RolePrivilegeSumOrderByAggregateInputObjectSchema } from './RolePrivilegeSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  roleId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional(),
  _count: z.lazy(() => RolePrivilegeCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => RolePrivilegeAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => RolePrivilegeMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => RolePrivilegeMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => RolePrivilegeSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const RolePrivilegeOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.RolePrivilegeOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeOrderByWithAggregationInput>;
export const RolePrivilegeOrderByWithAggregationInputObjectZodSchema = makeSchema();
