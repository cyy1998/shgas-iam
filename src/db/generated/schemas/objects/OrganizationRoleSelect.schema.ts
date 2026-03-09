import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationArgsObjectSchema as OrganizationArgsObjectSchema } from './OrganizationArgs.schema';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema'

const makeSchema = () => z.object({
  organizationId: z.boolean().optional(),
  roleId: z.boolean().optional(),
  isAllSub: z.boolean().optional(),
  organization: z.union([z.boolean(), z.lazy(() => OrganizationArgsObjectSchema)]).optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional()
}).strict();
export const OrganizationRoleSelectObjectSchema: z.ZodType<Prisma.OrganizationRoleSelect> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleSelect>;
export const OrganizationRoleSelectObjectZodSchema = makeSchema();
