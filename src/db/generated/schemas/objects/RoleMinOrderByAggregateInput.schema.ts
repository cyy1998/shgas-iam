import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  roleCode: SortOrderSchema.optional(),
  roleName: SortOrderSchema.optional(),
  clientId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const RoleMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RoleMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleMinOrderByAggregateInput>;
export const RoleMinOrderByAggregateInputObjectZodSchema = makeSchema();
