import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const roleprivilegescalarwhereinputSchema = z.object({
  AND: z.union([z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema), z.lazy(() => RolePrivilegeScalarWhereInputObjectSchema).array()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const RolePrivilegeScalarWhereInputObjectSchema: z.ZodType<Prisma.RolePrivilegeScalarWhereInput> = roleprivilegescalarwhereinputSchema as unknown as z.ZodType<Prisma.RolePrivilegeScalarWhereInput>;
export const RolePrivilegeScalarWhereInputObjectZodSchema = roleprivilegescalarwhereinputSchema;
