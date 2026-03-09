import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationSelectObjectSchema as PrivilegeDelegationSelectObjectSchema } from './PrivilegeDelegationSelect.schema';
import { PrivilegeDelegationIncludeObjectSchema as PrivilegeDelegationIncludeObjectSchema } from './PrivilegeDelegationInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PrivilegeDelegationSelectObjectSchema).optional(),
  include: z.lazy(() => PrivilegeDelegationIncludeObjectSchema).optional()
}).strict();
export const PrivilegeDelegationArgsObjectSchema = makeSchema();
export const PrivilegeDelegationArgsObjectZodSchema = makeSchema();
