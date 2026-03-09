import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema';
import { RoleScalarRelationFilterObjectSchema as RoleScalarRelationFilterObjectSchema } from './RoleScalarRelationFilter.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './RoleWhereInput.schema';
import { PrivilegeScalarRelationFilterObjectSchema as PrivilegeScalarRelationFilterObjectSchema } from './PrivilegeScalarRelationFilter.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './PrivilegeWhereInput.schema'

const roleprivilegewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => RolePrivilegeWhereInputObjectSchema), z.lazy(() => RolePrivilegeWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RolePrivilegeWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RolePrivilegeWhereInputObjectSchema), z.lazy(() => RolePrivilegeWhereInputObjectSchema).array()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  role: z.union([z.lazy(() => RoleScalarRelationFilterObjectSchema), z.lazy(() => RoleWhereInputObjectSchema)]).optional(),
  privilege: z.union([z.lazy(() => PrivilegeScalarRelationFilterObjectSchema), z.lazy(() => PrivilegeWhereInputObjectSchema)]).optional()
}).strict();
export const RolePrivilegeWhereInputObjectSchema: z.ZodType<Prisma.RolePrivilegeWhereInput> = roleprivilegewhereinputSchema as unknown as z.ZodType<Prisma.RolePrivilegeWhereInput>;
export const RolePrivilegeWhereInputObjectZodSchema = roleprivilegewhereinputSchema;
