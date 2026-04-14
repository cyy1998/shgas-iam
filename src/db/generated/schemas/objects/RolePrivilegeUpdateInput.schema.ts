import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeUpdateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateInput>;
export const RolePrivilegeUpdateInputObjectZodSchema = makeSchema();
