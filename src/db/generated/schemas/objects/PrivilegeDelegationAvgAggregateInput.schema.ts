import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  delegatorUserId: z.literal(true).optional(),
  delegateeUserId: z.literal(true).optional(),
  organizationScopeId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PrivilegeDelegationAvgAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationAvgAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationAvgAggregateInputType>;
export const PrivilegeDelegationAvgAggregateInputObjectZodSchema = makeSchema();
