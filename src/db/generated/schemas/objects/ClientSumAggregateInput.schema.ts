import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const ClientSumAggregateInputObjectSchema: z.ZodType<Prisma.ClientSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.ClientSumAggregateInputType>;
export const ClientSumAggregateInputObjectZodSchema = makeSchema();
