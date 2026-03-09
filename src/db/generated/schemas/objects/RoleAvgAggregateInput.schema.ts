import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  clientId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const RoleAvgAggregateInputObjectSchema: z.ZodType<Prisma.RoleAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RoleAvgAggregateInputType>;
export const RoleAvgAggregateInputObjectZodSchema = makeSchema();
