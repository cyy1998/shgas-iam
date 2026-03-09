import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  orgId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PosOrgCompositionAvgAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionAvgAggregateInputType>;
export const PosOrgCompositionAvgAggregateInputObjectZodSchema = makeSchema();
