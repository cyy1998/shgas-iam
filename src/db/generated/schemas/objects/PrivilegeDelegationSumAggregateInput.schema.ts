import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  delegatorUserId: z.literal(true).optional(),
  delegateeUserId: z.literal(true).optional(),
  organizationScopeId: z.literal(true).optional(),
  status: z.literal(true).optional()
}).strict();
export const PrivilegeDelegationSumAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationSumAggregateInputType>;
export const PrivilegeDelegationSumAggregateInputObjectZodSchema = makeSchema();
