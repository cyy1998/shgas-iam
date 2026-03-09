import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgRolePosOrgIdRoleIdCompoundUniqueInputObjectSchema as PosOrgRolePosOrgIdRoleIdCompoundUniqueInputObjectSchema } from './PosOrgRolePosOrgIdRoleIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  posOrgId_roleId: z.lazy(() => PosOrgRolePosOrgIdRoleIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const PosOrgRoleWhereUniqueInputObjectSchema: z.ZodType<Prisma.PosOrgRoleWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleWhereUniqueInput>;
export const PosOrgRoleWhereUniqueInputObjectZodSchema = makeSchema();
