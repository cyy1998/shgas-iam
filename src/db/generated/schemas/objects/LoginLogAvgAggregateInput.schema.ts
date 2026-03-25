import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional()
}).strict();
export const LoginLogAvgAggregateInputObjectSchema: z.ZodType<Prisma.LoginLogAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogAvgAggregateInputType>;
export const LoginLogAvgAggregateInputObjectZodSchema = makeSchema();
