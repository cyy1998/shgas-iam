import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';


const makeSchema = () => z.object({
  organizationId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const OrganizationRoleOrganizationIdRoleIdCompoundUniqueInputObjectSchema: z.ZodType<Prisma.OrganizationRoleOrganizationIdRoleIdCompoundUniqueInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleOrganizationIdRoleIdCompoundUniqueInput>;
export const OrganizationRoleOrganizationIdRoleIdCompoundUniqueInputObjectZodSchema = makeSchema();
