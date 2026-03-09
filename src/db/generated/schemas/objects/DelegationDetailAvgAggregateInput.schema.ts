import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const DelegationDetailAvgAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailAvgAggregateInputType>;
export const DelegationDetailAvgAggregateInputObjectZodSchema = makeSchema();
