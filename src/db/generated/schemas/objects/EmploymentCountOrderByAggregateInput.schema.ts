import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  deptId: SortOrderSchema.optional(),
  compId: SortOrderSchema.optional(),
  isPrimary: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const EmploymentCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCountOrderByAggregateInput>;
export const EmploymentCountOrderByAggregateInputObjectZodSchema = makeSchema();
