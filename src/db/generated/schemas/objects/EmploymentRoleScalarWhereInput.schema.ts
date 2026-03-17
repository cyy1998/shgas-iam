import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const employmentrolescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema), z.lazy(() => EmploymentRoleScalarWhereInputObjectSchema).array()]).optional(),
  employmentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const EmploymentRoleScalarWhereInputObjectSchema: z.ZodType<Prisma.EmploymentRoleScalarWhereInput> = employmentrolescalarwhereinputSchema as unknown as z.ZodType<Prisma.EmploymentRoleScalarWhereInput>;
export const EmploymentRoleScalarWhereInputObjectZodSchema = employmentrolescalarwhereinputSchema;
