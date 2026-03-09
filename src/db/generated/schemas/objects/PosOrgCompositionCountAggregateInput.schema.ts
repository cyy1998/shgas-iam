import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  orgId: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const PosOrgCompositionCountAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionCountAggregateInputType>;
export const PosOrgCompositionCountAggregateInputObjectZodSchema = makeSchema();
