import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { EmploymentRoleCountOrderByAggregateInputObjectSchema as EmploymentRoleCountOrderByAggregateInputObjectSchema } from './EmploymentRoleCountOrderByAggregateInput.schema';
import { EmploymentRoleAvgOrderByAggregateInputObjectSchema as EmploymentRoleAvgOrderByAggregateInputObjectSchema } from './EmploymentRoleAvgOrderByAggregateInput.schema';
import { EmploymentRoleMaxOrderByAggregateInputObjectSchema as EmploymentRoleMaxOrderByAggregateInputObjectSchema } from './EmploymentRoleMaxOrderByAggregateInput.schema';
import { EmploymentRoleMinOrderByAggregateInputObjectSchema as EmploymentRoleMinOrderByAggregateInputObjectSchema } from './EmploymentRoleMinOrderByAggregateInput.schema';
import { EmploymentRoleSumOrderByAggregateInputObjectSchema as EmploymentRoleSumOrderByAggregateInputObjectSchema } from './EmploymentRoleSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional(),
  _count: z.lazy(() => EmploymentRoleCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => EmploymentRoleAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => EmploymentRoleMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => EmploymentRoleMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => EmploymentRoleSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const EmploymentRoleOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.EmploymentRoleOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleOrderByWithAggregationInput>;
export const EmploymentRoleOrderByWithAggregationInputObjectZodSchema = makeSchema();
