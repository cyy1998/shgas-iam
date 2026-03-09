import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema';
import { PrivilegeArgsObjectSchema as PrivilegeArgsObjectSchema } from './PrivilegeArgs.schema'

const makeSchema = () => z.object({
  roleId: z.boolean().optional(),
  privilegeId: z.boolean().optional(),
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional(),
  privilege: z.union([z.boolean(), z.lazy(() => PrivilegeArgsObjectSchema)]).optional()
}).strict();
export const RolePrivilegeSelectObjectSchema: z.ZodType<Prisma.RolePrivilegeSelect> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeSelect>;
export const RolePrivilegeSelectObjectZodSchema = makeSchema();
