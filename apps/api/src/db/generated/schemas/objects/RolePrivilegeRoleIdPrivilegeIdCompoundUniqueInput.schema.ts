import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  roleId: z.number().int(),
  privilegeId: z.number().int()
}).strict();
export const RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInput>;
export const RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInputObjectZodSchema = makeSchema();
