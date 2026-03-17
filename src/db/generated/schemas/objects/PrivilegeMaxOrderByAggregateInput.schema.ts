import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  privilegeCode: SortOrderSchema.optional(),
  privilegeName: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const PrivilegeMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeMaxOrderByAggregateInput>;
export const PrivilegeMaxOrderByAggregateInputObjectZodSchema = makeSchema();
