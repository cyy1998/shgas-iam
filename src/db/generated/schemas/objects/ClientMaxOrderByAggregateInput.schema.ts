import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  clientCode: SortOrderSchema.optional(),
  clientName: SortOrderSchema.optional(),
  url: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const ClientMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.ClientMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientMaxOrderByAggregateInput>;
export const ClientMaxOrderByAggregateInputObjectZodSchema = makeSchema();
