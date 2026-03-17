import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PositionAvgAggregateInputObjectSchema: z.ZodType<Prisma.PositionAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionAvgAggregateInputType>;
export const PositionAvgAggregateInputObjectZodSchema = makeSchema();
