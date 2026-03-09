import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPrivilegesNestedInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPrivilegesNestedInputObjectSchema).optional()
}).strict();
export const RolePrivilegeUpdateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateWithoutPrivilegeInput>;
export const RolePrivilegeUpdateWithoutPrivilegeInputObjectZodSchema = makeSchema();
