import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int()
}).strict();
export const RolePrivilegeCreateManyPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeCreateManyPrivilegeInput>;
export const RolePrivilegeCreateManyPrivilegeInputObjectZodSchema = makeSchema();
