import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const PositionRoleOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleOrderByRelationAggregateInput>;
export const PositionRoleOrderByRelationAggregateInputObjectZodSchema = makeSchema();
