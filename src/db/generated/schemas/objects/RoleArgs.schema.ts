import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './RoleInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => RoleSelectObjectSchema).optional(),
  include: z.lazy(() => RoleIncludeObjectSchema).optional()
}).strict();
export const RoleArgsObjectSchema = makeSchema();
export const RoleArgsObjectZodSchema = makeSchema();
