import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleOrganizationIdRoleIdCompoundUniqueInputObjectSchema as OrganizationRoleOrganizationIdRoleIdCompoundUniqueInputObjectSchema } from './OrganizationRoleOrganizationIdRoleIdCompoundUniqueInput.schema'

const makeSchema = () => z.object({
  organizationId_roleId: z.lazy(() => OrganizationRoleOrganizationIdRoleIdCompoundUniqueInputObjectSchema).optional()
}).strict();
export const OrganizationRoleWhereUniqueInputObjectSchema: z.ZodType<Prisma.OrganizationRoleWhereUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleWhereUniqueInput>;
export const OrganizationRoleWhereUniqueInputObjectZodSchema = makeSchema();
