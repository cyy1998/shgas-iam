import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeSelectObjectSchema as PrivilegeSelectObjectSchema } from './PrivilegeSelect.schema';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './PrivilegeInclude.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => PrivilegeSelectObjectSchema).optional(),
  include: z.lazy(() => PrivilegeIncludeObjectSchema).optional()
}).strict();
export const PrivilegeArgsObjectSchema = makeSchema();
export const PrivilegeArgsObjectZodSchema = makeSchema();
