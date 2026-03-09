import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const DelegationDetailMaxAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailMaxAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailMaxAggregateInputType>;
export const DelegationDetailMaxAggregateInputObjectZodSchema = makeSchema();
