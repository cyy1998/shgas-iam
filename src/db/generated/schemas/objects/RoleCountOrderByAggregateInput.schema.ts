import { z } from '@hono/zod-openapi';
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
export const RoleCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RoleCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleCountOrderByAggregateInput>;
export const RoleCountOrderByAggregateInputObjectZodSchema = makeSchema();
