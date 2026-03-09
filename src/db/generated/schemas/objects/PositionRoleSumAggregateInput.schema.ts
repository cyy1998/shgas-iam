import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PositionRoleSumAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleSumAggregateInputType>;
export const PositionRoleSumAggregateInputObjectZodSchema = makeSchema();
