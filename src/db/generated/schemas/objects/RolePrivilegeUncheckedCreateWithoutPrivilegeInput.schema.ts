import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedCreateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedCreateWithoutPrivilegeInput>;
export const RolePrivilegeUncheckedCreateWithoutPrivilegeInputObjectZodSchema = makeSchema();
