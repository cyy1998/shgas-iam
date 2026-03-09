import { z } from '@hono/zod-openapi';
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
export const EmploymentMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentMaxOrderByAggregateInput>;
export const EmploymentMaxOrderByAggregateInputObjectZodSchema = makeSchema();
