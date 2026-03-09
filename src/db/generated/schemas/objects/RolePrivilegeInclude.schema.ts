import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleArgsObjectSchema as RoleArgsObjectSchema } from './RoleArgs.schema';
import { PrivilegeArgsObjectSchema as PrivilegeArgsObjectSchema } from './PrivilegeArgs.schema'

const makeSchema = () => z.object({
  role: z.union([z.boolean(), z.lazy(() => RoleArgsObjectSchema)]).optional(),
  privilege: z.union([z.boolean(), z.lazy(() => PrivilegeArgsObjectSchema)]).optional()
}).strict();
export const RolePrivilegeIncludeObjectSchema: z.ZodType<Prisma.RolePrivilegeInclude> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeInclude>;
export const RolePrivilegeIncludeObjectZodSchema = makeSchema();
