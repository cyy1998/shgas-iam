import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  delegationId: SortOrderSchema.optional(),
  privilegeId: SortOrderSchema.optional()
}).strict();
export const DelegationDetailSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailSumOrderByAggregateInput>;
export const DelegationDetailSumOrderByAggregateInputObjectZodSchema = makeSchema();
