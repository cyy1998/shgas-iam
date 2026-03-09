import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  posCode: z.literal(true).optional(),
  posName: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const PositionCountAggregateInputObjectSchema: z.ZodType<Prisma.PositionCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PositionCountAggregateInputType>;
export const PositionCountAggregateInputObjectZodSchema = makeSchema();
