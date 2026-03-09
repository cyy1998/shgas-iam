import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInputObjectSchema as RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInputObjectSchema } from './RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  roleId_privilegeId: z.lazy(() => RolePrivilegeRoleIdPrivilegeIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const RolePrivilegeWhereUniqueInputObjectSchema: z.ZodType<Prisma.RolePrivilegeWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeWhereUniqueInput>;
export const RolePrivilegeWhereUniqueInputObjectZodSchema = makeSchema();
