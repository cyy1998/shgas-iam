import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeUncheckedCreateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedCreateInput>;
export const RolePrivilegeUncheckedCreateInputObjectZodSchema = makeSchema();
