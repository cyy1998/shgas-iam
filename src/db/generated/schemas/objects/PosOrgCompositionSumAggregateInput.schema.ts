import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  posId: z.literal(true).optional(),
  orgId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PosOrgCompositionSumAggregateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionSumAggregateInputType>;
export const PosOrgCompositionSumAggregateInputObjectZodSchema = makeSchema();
