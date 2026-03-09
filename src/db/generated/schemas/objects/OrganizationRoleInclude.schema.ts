import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  organization: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const OrganizationRoleIncludeObjectSchema: z.ZodType<Prisma.OrganizationRoleInclude> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleInclude>;
export const OrganizationRoleIncludeObjectZodSchema = makeSchema();
