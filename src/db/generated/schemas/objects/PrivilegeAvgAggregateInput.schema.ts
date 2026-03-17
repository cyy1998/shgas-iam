import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PrivilegeAvgAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeAvgAggregateInputType>;
export const PrivilegeAvgAggregateInputObjectZodSchema = makeSchema();
