import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeUncheckedCreateWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedCreateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedCreateWithoutRoleInput>;
export const RolePrivilegeUncheckedCreateWithoutRoleInputObjectZodSchema = makeSchema();
