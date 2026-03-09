import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  deptId: z.literal(true).optional(),
  compId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const EmploymentSumAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentSumAggregateInputType>;
export const EmploymentSumAggregateInputObjectZodSchema = makeSchema();
