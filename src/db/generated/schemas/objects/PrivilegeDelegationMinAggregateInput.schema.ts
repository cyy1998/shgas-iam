import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  id: z.literal(true).optional(),
  delegatorUserId: z.literal(true).optional(),
  delegateeUserId: z.literal(true).optional(),
  organizationScopeId: z.literal(true).optional(),
  startTime: z.literal(true).optional(),
  endTime: z.literal(true).optional(),
  status: z.literal(true).optional(),
  description: z.literal(true).optional(),
  isDelete: z.literal(true).optional(),
  createTime: z.literal(true).optional(),
  updateTime: z.literal(true).optional()
}).strict();
export const PrivilegeDelegationMinAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationMinAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationMinAggregateInputType>;
export const PrivilegeDelegationMinAggregateInputObjectZodSchema = makeSchema();
