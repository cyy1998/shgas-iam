import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  positionId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const PositionRoleMinAggregateInputObjectSchema: z.ZodType<Prisma.PositionRoleMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleMinAggregateInputType>;
export const PositionRoleMinAggregateInputObjectZodSchema = makeSchema();
