import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const OrganizationRoleOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleOrderByRelationAggregateInput>;
export const OrganizationRoleOrderByRelationAggregateInputObjectZodSchema = makeSchema();
