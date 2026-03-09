import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { PositionRoleCountOrderByAggregateInputObjectSchema as PositionRoleCountOrderByAggregateInputObjectSchema } from './PositionRoleCountOrderByAggregateInput.schema';
import { PositionRoleAvgOrderByAggregateInputObjectSchema as PositionRoleAvgOrderByAggregateInputObjectSchema } from './PositionRoleAvgOrderByAggregateInput.schema';
import { PositionRoleMaxOrderByAggregateInputObjectSchema as PositionRoleMaxOrderByAggregateInputObjectSchema } from './PositionRoleMaxOrderByAggregateInput.schema';
import { PositionRoleMinOrderByAggregateInputObjectSchema as PositionRoleMinOrderByAggregateInputObjectSchema } from './PositionRoleMinOrderByAggregateInput.schema';
import { PositionRoleSumOrderByAggregateInputObjectSchema as PositionRoleSumOrderByAggregateInputObjectSchema } from './PositionRoleSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  positionId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  _count: z.lazy(() => PositionRoleCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => PositionRoleAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => PositionRoleMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => PositionRoleMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => PositionRoleSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const PositionRoleOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.PositionRoleOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleOrderByWithAggregationInput>;
export const PositionRoleOrderByWithAggregationInputObjectZodSchema = makeSchema();
