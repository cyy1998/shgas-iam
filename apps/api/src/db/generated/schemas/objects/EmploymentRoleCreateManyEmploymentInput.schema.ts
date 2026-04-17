import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const EmploymentRoleCreateManyEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleCreateManyEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleCreateManyEmploymentInput>;
export const EmploymentRoleCreateManyEmploymentInputObjectZodSchema = makeSchema();
