import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationRoleSelectObjectSchema as OrganizationRoleSelectObjectSchema } from './OrganizationRoleSelect.schema';
import { OrganizationRoleIncludeObjectSchema as OrganizationRoleIncludeObjectSchema } from './OrganizationRoleInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => OrganizationRoleSelectObjectSchema).optional(),
  include: z.lazy(() => OrganizationRoleIncludeObjectSchema).optional()
}).strict();
export const OrganizationRoleArgsObjectSchema = makeSchema();
export const OrganizationRoleArgsObjectZodSchema = makeSchema();
