import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PositionRoleMaxAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleMaxAggregateInputType>;
export const PositionRoleMaxAggregateInputObjectZodSchema = makeSchema();
