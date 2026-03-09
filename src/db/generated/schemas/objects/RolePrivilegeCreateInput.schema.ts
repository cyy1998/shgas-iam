import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutPrivilegesInputObjectSchema as RoleCreateNestedOneWithoutPrivilegesInputObjectSchema } from './RoleCreateNestedOneWithoutPrivilegesInput.schema';
import { PrivilegeCreateNestedOneWithoutRolesInputObjectSchema as PrivilegeCreateNestedOneWithoutRolesInputObjectSchema } from './PrivilegeCreateNestedOneWithoutRolesInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleCreateNestedOneWithoutPrivilegesInputObjectSchema),
  privilege: z.lazy(() => PrivilegeCreateNestedOneWithoutRolesInputObjectSchema)
}).strict();
export const RolePrivilegeCreateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateInput>;
export const RolePrivilegeCreateInputObjectZodSchema = makeSchema();
