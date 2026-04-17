import * as z from 'zod';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const PosOrgRolePosOrgIdRoleIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.PosOrgRolePosOrgIdRoleIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRolePosOrgIdRoleIdCompoundUniqueInput>;
export const PosOrgRolePosOrgIdRoleIdCompoundUniqueInputObjectZodSchema = makeSchema();
