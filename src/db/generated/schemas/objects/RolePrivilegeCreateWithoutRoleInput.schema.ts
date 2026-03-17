import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCreateNestedOneWithoutRolesInputObjectSchema as PrivilegeCreateNestedOneWithoutRolesInputObjectSchema } from './PrivilegeCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  privilege: z.lazy(() => PrivilegeCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const RolePrivilegeCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateWithoutRoleInput>;
export const RolePrivilegeCreateWithoutRoleInputObjectZodSchema = makeSchema();
