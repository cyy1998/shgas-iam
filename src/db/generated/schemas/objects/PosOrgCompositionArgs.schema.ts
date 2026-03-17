import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './PosOrgCompositionInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PosOrgCompositionSelectObjectSchema).optional(),
  include: z.lazy(() => PosOrgCompositionIncludeObjectSchema).optional()
}).strict();
export const PosOrgCompositionArgsObjectSchema = makeSchema();
export const PosOrgCompositionArgsObjectZodSchema = makeSchema();
