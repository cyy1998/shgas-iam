import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PrivilegeUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  privilege: z.lazy(() => PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const RolePrivilegeUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateWithoutRoleInput>;
export const RolePrivilegeUpdateWithoutRoleInputObjectZodSchema = makeSchema();
