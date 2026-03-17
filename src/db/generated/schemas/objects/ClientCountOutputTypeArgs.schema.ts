import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientCountOutputTypeSelectObjectSchema as ClientCountOutputTypeSelectObjectSchema } from './ClientCountOutputTypeSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => ClientCountOutputTypeSelectObjectSchema).optional()
}).strict();
export const ClientCountOutputTypeArgsObjectSchema = makeSchema();
export const ClientCountOutputTypeArgsObjectZodSchema = makeSchema();
