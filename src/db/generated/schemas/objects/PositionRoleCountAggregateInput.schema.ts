import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.literal(true).optional(),
  roleId: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const PositionRoleCountAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleCountAggregateInputType>;
export const PositionRoleCountAggregateInputObjectZodSchema = makeSchema();
