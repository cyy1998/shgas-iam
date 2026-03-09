import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { PosOrgRoleCountOrderByAggregateInputObjectSchema as PosOrgRoleCountOrderByAggregateInputObjectSchema } from './PosOrgRoleCountOrderByAggregateInput.schema';
import { PosOrgRoleAvgOrderByAggregateInputObjectSchema as PosOrgRoleAvgOrderByAggregateInputObjectSchema } from './PosOrgRoleAvgOrderByAggregateInput.schema';
import { PosOrgRoleMaxOrderByAggregateInputObjectSchema as PosOrgRoleMaxOrderByAggregateInputObjectSchema } from './PosOrgRoleMaxOrderByAggregateInput.schema';
import { PosOrgRoleMinOrderByAggregateInputObjectSchema as PosOrgRoleMinOrderByAggregateInputObjectSchema } from './PosOrgRoleMinOrderByAggregateInput.schema';
import { PosOrgRoleSumOrderByAggregateInputObjectSchema as PosOrgRoleSumOrderByAggregateInputObjectSchema } from './PosOrgRoleSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  posOrgId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  _count: z.lazy(() => PosOrgRoleCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PosOrgRoleAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PosOrgRoleMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PosOrgRoleMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PosOrgRoleSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PosOrgRoleOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PosOrgRoleOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleOrderByWithAggregationInput>;
export const PosOrgRoleOrderByWithAggregationInputObjectZodSchema = makeSchema();
