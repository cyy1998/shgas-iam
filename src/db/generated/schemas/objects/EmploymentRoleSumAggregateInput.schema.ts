import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.literal(true).optional(),
  roleId: z.literal(true).optional()
}).strict();
export const EmploymentRoleSumAggregateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleSumAggregateInputType> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleSumAggregateInputType>;
export const EmploymentRoleSumAggregateInputObjectZodSchema = makeSchema();
