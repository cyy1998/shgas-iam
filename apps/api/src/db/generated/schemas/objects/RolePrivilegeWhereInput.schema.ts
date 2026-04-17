import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFilterObjectSchema as IntFilterObjectSchema } from './IntFilter.schema'

const roleprivilegewhereinputSchema = z.object({
  AND: z.union([z.lazy(() => RolePrivilegeWhereInputObjectSchema), z.lazy(() => RolePrivilegeWhereInputObjectSchema).array()]).optional(),
  OR: z.lazy(() => RolePrivilegeWhereInputObjectSchema).array().optional(),
  NOT: z.union([z.lazy(() => RolePrivilegeWhereInputObjectSchema), z.lazy(() => RolePrivilegeWhereInputObjectSchema).array()]).optional(),
  roleId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional(),
  privilegeId: z.union([z.lazy(() => IntFilterObjectSchema), z.number().int()]).optional()
}).strict();
export const RolePrivilegeWhereInputObjectSchema: z.ZodType<Prisma.RolePrivilegeWhereInput> = roleprivilegewhereinputSchema as unknown as z.ZodType<Prisma.RolePrivilegeWhereInput>;
export const RolePrivilegeWhereInputObjectZodSchema = roleprivilegewhereinputSchema;
