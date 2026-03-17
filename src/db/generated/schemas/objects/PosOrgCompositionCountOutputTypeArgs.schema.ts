import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionCountOutputTypeSelectObjectSchema as PosOrgCompositionCountOutputTypeSelectObjectSchema } from './PosOrgCompositionCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PosOrgCompositionCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const PosOrgCompositionCountOutputTypeArgsObjectSchema = makeSchema();
export const PosOrgCompositionCountOutputTypeArgsObjectZodSchema = makeSchema();
