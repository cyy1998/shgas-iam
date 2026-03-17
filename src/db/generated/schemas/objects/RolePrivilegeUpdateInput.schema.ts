import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPrivilegesNestedInput.schema';
import { PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PrivilegeUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema).optional(),
  privilege: z.lazy(() => PrivilegeUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const RolePrivilegeUpdateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateInput>;
export const RolePrivilegeUpdateInputObjectZodSchema = makeSchema();
