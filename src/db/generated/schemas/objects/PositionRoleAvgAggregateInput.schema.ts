import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PositionRoleAvgAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleAvgAggregateInputType>;
export const PositionRoleAvgAggregateInputObjectZodSchema = makeSchema();
