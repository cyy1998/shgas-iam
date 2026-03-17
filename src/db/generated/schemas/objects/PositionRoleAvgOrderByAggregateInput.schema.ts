import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  positionId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const PositionRoleAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleAvgOrderByAggregateInput>;
export const PositionRoleAvgOrderByAggregateInputObjectZodSchema = makeSchema();
