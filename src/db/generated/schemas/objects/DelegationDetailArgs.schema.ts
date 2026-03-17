import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './DelegationDetailInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => DelegationDetailSelectObjectSchema).optional(),
  include: z.lazy(() => DelegationDetailIncludeObjectSchema).optional()
}).strict();
export const DelegationDetailArgsObjectSchema = makeSchema();
export const DelegationDetailArgsObjectZodSchema = makeSchema();
