import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const PosOrgCompositionOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionOrderByRelationAggregateInput>;
export const PosOrgCompositionOrderByRelationAggregateInputObjectZodSchema = makeSchema();
