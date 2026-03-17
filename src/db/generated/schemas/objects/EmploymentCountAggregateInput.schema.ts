import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  userId: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  orgId: z.literal(true).optional(),
  compId: z.literal(true).optional(),
  isPrimary: z.literal(true).optional(),
  status: z.literal(true).optional(),
  startTime: z.literal(true).optional(),
  endTime: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const EmploymentCountAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentCountAggregateInputType>;
export const EmploymentCountAggregateInputObjectZodSchema = makeSchema();
