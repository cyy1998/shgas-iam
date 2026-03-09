import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  clientId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const RoleAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.RoleAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleAvgOrderByAggregateInput>;
export const RoleAvgOrderByAggregateInputObjectZodSchema = makeSchema();
