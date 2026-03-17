import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional(),
  _all: z.literal(true).optional()
}).strict();
export const DelegationDetailCountAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailCountAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailCountAggregateInputType>;
export const DelegationDetailCountAggregateInputObjectZodSchema = makeSchema();
