import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionSelectObjectSchema as PositionSelectObjectSchema } from './PositionSelect.schema';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './PositionInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PositionSelectObjectSchema).optional(),
  include: z.lazy(() => PositionIncludeObjectSchema).optional()
}).strict();
export const PositionArgsObjectSchema = makeSchema();
export const PositionArgsObjectZodSchema = makeSchema();
