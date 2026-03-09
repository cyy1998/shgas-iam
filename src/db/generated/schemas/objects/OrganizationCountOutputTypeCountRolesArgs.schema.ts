import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './OrganizationRoleWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => OrganizationRoleWhereInputObjectSchema).optional()
}).strict();
export const OrganizationCountOutputTypeCountRolesArgsObjectSchema = makeSchema();
export const OrganizationCountOutputTypeCountRolesArgsObjectZodSchema = makeSchema();
