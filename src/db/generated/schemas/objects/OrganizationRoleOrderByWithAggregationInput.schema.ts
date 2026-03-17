import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { OrganizationRoleCountOrderByAggregateInputObjectSchema as OrganizationRoleCountOrderByAggregateInputObjectSchema } from './OrganizationRoleCountOrderByAggregateInput.schema';
import { OrganizationRoleAvgOrderByAggregateInputObjectSchema as OrganizationRoleAvgOrderByAggregateInputObjectSchema } from './OrganizationRoleAvgOrderByAggregateInput.schema';
import { OrganizationRoleMaxOrderByAggregateInputObjectSchema as OrganizationRoleMaxOrderByAggregateInputObjectSchema } from './OrganizationRoleMaxOrderByAggregateInput.schema';
import { OrganizationRoleMinOrderByAggregateInputObjectSchema as OrganizationRoleMinOrderByAggregateInputObjectSchema } from './OrganizationRoleMinOrderByAggregateInput.schema';
import { OrganizationRoleSumOrderByAggregateInputObjectSchema as OrganizationRoleSumOrderByAggregateInputObjectSchema } from './OrganizationRoleSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  organizationId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  isAllSub: SortOrderSchema.optional(),
  _count: z.lazy(() => OrganizationRoleCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => OrganizationRoleAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => OrganizationRoleMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => OrganizationRoleMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => OrganizationRoleSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const OrganizationRoleOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleOrderByWithAggregationInput>;
export const OrganizationRoleOrderByWithAggregationInputObjectZodSchema = makeSchema();
