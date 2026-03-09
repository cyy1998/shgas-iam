import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const PrivilegeAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeAvgOrderByAggregateInput>;
export const PrivilegeAvgOrderByAggregateInputObjectZodSchema = makeSchema();
