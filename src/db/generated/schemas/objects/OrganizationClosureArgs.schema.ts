import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { OrganizationClosureSelectObjectSchema as OrganizationClosureSelectObjectSchema } from './OrganizationClosureSelect.schema';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './OrganizationClosureInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => OrganizationClosureSelectObjectSchema).optional(),
  include: z.lazy(() => OrganizationClosureIncludeObjectSchema).optional()
}).strict();
export const OrganizationClosureArgsObjectSchema = makeSchema();
export const OrganizationClosureArgsObjectZodSchema = makeSchema();
