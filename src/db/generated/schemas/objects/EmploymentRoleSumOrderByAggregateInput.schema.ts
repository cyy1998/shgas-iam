import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  employmentId: SortOrderSchema.optional(),
  roleId: SortOrderSchema.optional()
}).strict();
export const EmploymentRoleSumOrderByAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleSumOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleSumOrderByAggregateInput>;
export const EmploymentRoleSumOrderByAggregateInputObjectZodSchema = makeSchema();
