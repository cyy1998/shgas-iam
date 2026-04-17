import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const EmploymentOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentOrderByRelationAggregateInput>;
export const EmploymentOrderByRelationAggregateInputObjectZodSchema = makeSchema();
