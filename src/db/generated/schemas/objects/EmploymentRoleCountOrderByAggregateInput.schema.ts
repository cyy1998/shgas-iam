import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const EmploymentRoleCountOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCountOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCountOrderByAggregateInput>;
export const EmploymentRoleCountOrderByAggregateInputObjectZodSchema = makeSchema();
