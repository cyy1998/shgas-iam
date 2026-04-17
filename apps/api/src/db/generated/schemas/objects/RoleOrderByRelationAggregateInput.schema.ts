import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const RoleOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.RoleOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleOrderByRelationAggregateInput>;
export const RoleOrderByRelationAggregateInputObjectZodSchema = makeSchema();
