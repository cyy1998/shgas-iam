import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  delegationId: z.literal(true).optional(),
  privilegeId: z.literal(true).optional()
}).strict();
export const DelegationDetailMinAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailMinAggregateInputType>;
export const DelegationDetailMinAggregateInputObjectZodSchema = makeSchema();
