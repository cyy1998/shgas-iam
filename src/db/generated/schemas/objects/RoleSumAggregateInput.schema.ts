import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  clientId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const RoleSumAggregateInputObjectSchema: z.ZodType<Prisma.RoleSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.RoleSumAggregateInputType>;
export const RoleSumAggregateInputObjectZodSchema = makeSchema();
