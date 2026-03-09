import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './OrganizationRoleWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => OrganizationRoleWhereInputObjectSchema).optional(),
  some: z.lazy(() => OrganizationRoleWhereInputObjectSchema).optional(),
  none: z.lazy(() => OrganizationRoleWhereInputObjectSchema).optional()
}).strict();
export const OrganizationRoleListRelationFilterObjectSchema: z.ZodType<Prisma.OrganizationRoleListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleListRelationFilter>;
export const OrganizationRoleListRelationFilterObjectZodSchema = makeSchema();
