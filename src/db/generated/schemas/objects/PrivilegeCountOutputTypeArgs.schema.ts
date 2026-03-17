import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCountOutputTypeSelectObjectSchema as PrivilegeCountOutputTypeSelectObjectSchema } from './PrivilegeCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PrivilegeCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const PrivilegeCountOutputTypeArgsObjectSchema = makeSchema();
export const PrivilegeCountOutputTypeArgsObjectZodSchema = makeSchema();
