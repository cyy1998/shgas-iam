import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const EmploymentRoleMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleMaxOrderByAggregateInput>;
export const EmploymentRoleMaxOrderByAggregateInputObjectZodSchema = makeSchema();
