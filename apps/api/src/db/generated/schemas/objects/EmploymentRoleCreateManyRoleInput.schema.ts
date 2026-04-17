import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.number().int()
}).strict();
export const EmploymentRoleCreateManyRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateManyRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyRoleInput>;
export const EmploymentRoleCreateManyRoleInputObjectZodSchema = makeSchema();
