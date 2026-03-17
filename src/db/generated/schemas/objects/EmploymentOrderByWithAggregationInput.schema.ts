import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema';
import { SortOrderInputObjectSchema as SortOrderInputObjectSchema } from './SortOrderInput.schema';
import { EmploymentCountOrderByAggregateInputObjectSchema as EmploymentCountOrderByAggregateInputObjectSchema } from './EmploymentCountOrderByAggregateInput.schema';
import { EmploymentAvgOrderByAggregateInputObjectSchema as EmploymentAvgOrderByAggregateInputObjectSchema } from './EmploymentAvgOrderByAggregateInput.schema';
import { EmploymentMaxOrderByAggregateInputObjectSchema as EmploymentMaxOrderByAggregateInputObjectSchema } from './EmploymentMaxOrderByAggregateInput.schema';
import { EmploymentMinOrderByAggregateInputObjectSchema as EmploymentMinOrderByAggregateInputObjectSchema } from './EmploymentMinOrderByAggregateInput.schema';
import { EmploymentSumOrderByAggregateInputObjectSchema as EmploymentSumOrderByAggregateInputObjectSchema } from './EmploymentSumOrderByAggregateInput.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  deptId: SortOrderSchema.optional(),
  compId: SortOrderSchema.optional(),
  isPrimary: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  description: z.union([SortOrderSchema, z.lazy(() => SortOrderInputObjectSchema)]).optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional(),
  _count: z.lazy(() => EmploymentCountOrderByAggregateInputObjectSchema).optional(),
  _avg: z.lazy(() => EmploymentAvgOrderByAggregateInputObjectSchema).optional(),
  _max: z.lazy(() => EmploymentMaxOrderByAggregateInputObjectSchema).optional(),
  _min: z.lazy(() => EmploymentMinOrderByAggregateInputObjectSchema).optional(),
  _sum: z.lazy(() => EmploymentSumOrderByAggregateInputObjectSchema).optional()
}).strict();
export const EmploymentOrderByWithAggregationInputObjectSchema: z.ZodType<Prisma.EmploymentOrderByWithAggregationInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentOrderByWithAggregationInput>;
export const EmploymentOrderByWithAggregationInputObjectZodSchema = makeSchema();
