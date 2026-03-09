import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { ClientSelectObjectSchema as ClientSelectObjectSchema } from './ClientSelect.schema';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './ClientInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => ClientSelectObjectSchema).optional(),
  include: z.lazy(() => ClientIncludeObjectSchema).optional()
}).strict();
export const ClientArgsObjectSchema = makeSchema();
export const ClientArgsObjectZodSchema = makeSchema();
