import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleCountOutputTypeSelectObjectSchema as RoleCountOutputTypeSelectObjectSchema } from './RoleCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => RoleCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const RoleCountOutputTypeArgsObjectSchema = makeSchema();
export const RoleCountOutputTypeArgsObjectZodSchema = makeSchema();
