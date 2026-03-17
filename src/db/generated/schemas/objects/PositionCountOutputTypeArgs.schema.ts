import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionCountOutputTypeSelectObjectSchema as PositionCountOutputTypeSelectObjectSchema } from './PositionCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PositionCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const PositionCountOutputTypeArgsObjectSchema = makeSchema();
export const PositionCountOutputTypeArgsObjectZodSchema = makeSchema();
