import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  employmentId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const EmploymentRoleCreateManyInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyInput>;
export const EmploymentRoleCreateManyInputObjectZodSchema = makeSchema();
