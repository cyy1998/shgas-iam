import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const employmentrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentRoleWhereInputObjectSchema), z.lazy(() => EmploymentRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentRoleWhereInputObjectSchema), z.lazy(() => EmploymentRoleWhereInputObjectSchema).array()]).optional(),
  employmentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const EmploymentRoleWhereInputObjectSchema: z.ZodType<Prisma.EmploymentRoleWhereInput> = employmentrolewhereinputSchema as unknown as z.ZodType<Prisma.EmploymentRoleWhereInput>;
export const EmploymentRoleWhereInputObjectZodSchema = employmentrolewhereinputSchema;
