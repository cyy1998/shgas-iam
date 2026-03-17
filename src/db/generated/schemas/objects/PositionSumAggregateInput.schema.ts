import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PositionSumAggregateInputObjectSchema: z.ZodType<Prisma.PositionSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionSumAggregateInputType>;
export const PositionSumAggregateInputObjectZodSchema = makeSchema();
