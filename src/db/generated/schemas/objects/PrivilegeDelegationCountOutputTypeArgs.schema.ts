import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCountOutputTypeSelectObjectSchema as PrivilegeDelegationCountOutputTypeSelectObjectSchema } from './PrivilegeDelegationCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PrivilegeDelegationCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCountOutputTypeArgsObjectSchema = makeSchema();
export const PrivilegeDelegationCountOutputTypeArgsObjectZodSchema = makeSchema();
