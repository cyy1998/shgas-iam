import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  privilegeCode: SortOrderSchema.optional(),
  privilegeName: SortOrderSchema.optional(),
  fieldValues: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const PrivilegeCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCountOrderByAggregateInput>;
export const PrivilegeCountOrderByAggregateInputObjectZodSchema = makeSchema();
