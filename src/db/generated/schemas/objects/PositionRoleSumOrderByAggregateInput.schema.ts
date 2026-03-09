import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  positionId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const PositionRoleSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleSumOrderByAggregateInput>;
export const PositionRoleSumOrderByAggregateInputObjectZodSchema = makeSchema();
