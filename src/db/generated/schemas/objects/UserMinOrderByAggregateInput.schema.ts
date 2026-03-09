import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  username: SortOrderSchema.optional(),
  wxId: SortOrderSchema.optional(),
  name: SortOrderSchema.optional(),
  password: SortOrderSchema.optional(),
  mobile: SortOrderSchema.optional(),
  userType: SortOrderSchema.optional(),
  orderNum: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const UserMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.UserMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.UserMinOrderByAggregateInput>;
export const UserMinOrderByAggregateInputObjectZodSchema = makeSchema();
