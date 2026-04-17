import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const DelegationDetailOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.DelegationDetailOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailOrderByRelationAggregateInput>;
export const DelegationDetailOrderByRelationAggregateInputObjectZodSchema = makeSchema();
