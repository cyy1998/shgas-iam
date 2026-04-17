import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const EmploymentRoleUpdateInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUpdateInput>;
export const EmploymentRoleUpdateInputObjectZodSchema = makeSchema();
