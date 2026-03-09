import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  delegatorUserId: SortOrderSchema.optional(),
  delegateeUserId: SortOrderSchema.optional(),
  organizationScopeId: SortOrderSchema.optional(),
  startTime: SortOrderSchema.optional(),
  endTime: SortOrderSchema.optional(),
  status: SortOrderSchema.optional(),
  description: SortOrderSchema.optional(),
  isDelete: SortOrderSchema.optional(),
  createTime: SortOrderSchema.optional(),
  updateTime: SortOrderSchema.optional()
}).strict();
export const PrivilegeDelegationCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCountOrderByAggregateInput>;
export const PrivilegeDelegationCountOrderByAggregateInputObjectZodSchema = makeSchema();
