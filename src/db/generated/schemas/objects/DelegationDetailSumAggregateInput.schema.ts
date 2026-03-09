import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const DelegationDetailSumAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailSumAggregateInputType>;
export const DelegationDetailSumAggregateInputObjectZodSchema = makeSchema();
