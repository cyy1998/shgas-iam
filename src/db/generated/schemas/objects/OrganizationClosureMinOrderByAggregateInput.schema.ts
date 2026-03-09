import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  ancestorId: SortOrderSchema.optional(),
  descendantId: SortOrderSchema.optional(),
  depth: SortOrderSchema.optional()
}).strict();
export const OrganizationClosureMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureMinOrderByAggregateInput>;
export const OrganizationClosureMinOrderByAggregateInputObjectZodSchema = makeSchema();
