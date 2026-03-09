import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  _count: SortOrderSchema.optional()
}).strict();
export const EmploymentRoleOrderByRelationAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleOrderByRelationAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleOrderByRelationAggregateInput>;
export const EmploymentRoleOrderByRelationAggregateInputObjectZodSchema = makeSchema();
