import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  deptId: z.literal(true).optional(),
  compId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const EmploymentAvgAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentAvgAggregateInputType>;
export const EmploymentAvgAggregateInputObjectZodSchema = makeSchema();
