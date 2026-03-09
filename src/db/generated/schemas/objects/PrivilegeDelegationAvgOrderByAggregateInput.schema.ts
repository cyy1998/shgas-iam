import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  delegatorUserId: SortOrderSchema.optional(),
  delegateeUserId: SortOrderSchema.optional(),
  organizationScopeId: SortOrderSchema.optional(),
  status: SortOrderSchema.optional()
}).strict();
export const PrivilegeDelegationAvgOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationAvgOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationAvgOrderByAggregateInput>;
export const PrivilegeDelegationAvgOrderByAggregateInputObjectZodSchema = makeSchema();
