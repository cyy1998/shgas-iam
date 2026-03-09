import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const ClientAvgAggregateInputObjectSchema: z.ZodType<Prisma.ClientAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.ClientAvgAggregateInputType>;
export const ClientAvgAggregateInputObjectZodSchema = makeSchema();
