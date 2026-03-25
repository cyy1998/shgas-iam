import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional()
}).strict();
export const LoginLogSumAggregateInputObjectSchema: z.ZodType<Prisma.LoginLogSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogSumAggregateInputType>;
export const LoginLogSumAggregateInputObjectZodSchema = makeSchema();
