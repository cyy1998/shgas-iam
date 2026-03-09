import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const EmploymentRoleMinOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleMinOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleMinOrderByAggregateInput>;
export const EmploymentRoleMinOrderByAggregateInputObjectZodSchema = makeSchema();
