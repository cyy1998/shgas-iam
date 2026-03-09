import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  posId: SortOrderSchema.optional(),
  orgId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const PosOrgCompositionSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionSumOrderByAggregateInput>;
export const PosOrgCompositionSumOrderByAggregateInputObjectZodSchema = makeSchema();
