import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleCreateNestedOneWithoutPrivilegesInputObjectSchema as RoleCreateNestedOneWithoutPrivilegesInputObjectSchema } from './RoleCreateNestedOneWithoutPrivilegesInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleCreateNestedOneWithoutPrivilegesInputObjectSchema)
}).strict();
export const RolePrivilegeCreateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateWithoutPrivilegeInput>;
export const RolePrivilegeCreateWithoutPrivilegeInputObjectZodSchema = makeSchema();
