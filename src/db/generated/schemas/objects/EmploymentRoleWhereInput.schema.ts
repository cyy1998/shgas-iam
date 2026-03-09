import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { EmploymentScalarRelationFilterObjectSchema as EmploymentScalarRelationFilterObjectSchema } from './EmploymentScalarRelationFilter.schema';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './EmploymentWhereInput.schema';
import { RoleScalarRelationFilterObjectSchema as RoleScalarRelationFilterObjectSchema } from './RoleScalarRelationFilter.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema'

const employmentrolewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => EmploymentRoleWhereInputObjectSchema), z.lazy(() => EmploymentRoleWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => EmploymentRoleWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => EmploymentRoleWhereInputObjectSchema), z.lazy(() => EmploymentRoleWhereInputObjectSchema).array()]).optional(),
  employmentId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  employment: z.union([z.lazy(() => EmploymentScalarRelationFilterObjectSchema), z.lazy(() => EmploymentWhereInputObjectSchema)]).optional(),
  role: z.union([z.lazy(() => RoleScalarRelationFilterObjectSchema), z.lazy(() => RoleWhereInputObjectSchema)]).optional()
}).strict();
export const EmploymentRoleWhereInputObjectSchema: z.ZodType<Prisma.EmploymentRoleWhereInput> = employmentrolewhereinputSchema as unknown as z.ZodType<Prisma.EmploymentRoleWhereInput>;
export const EmploymentRoleWhereInputObjectZodSchema = employmentrolewhereinputSchema;
