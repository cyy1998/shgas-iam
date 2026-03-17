import * as z from 'zod';
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
export const PrivilegeDelegationMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationMinOrderByAggregateInput>;
export const PrivilegeDelegationMinOrderByAggregateInputObjectZodSchema = makeSchema();
