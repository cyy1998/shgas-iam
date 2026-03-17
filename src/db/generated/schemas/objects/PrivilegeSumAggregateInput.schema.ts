import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PrivilegeSumAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeSumAggregateInputType>;
export const PrivilegeSumAggregateInputObjectZodSchema = makeSchema();
