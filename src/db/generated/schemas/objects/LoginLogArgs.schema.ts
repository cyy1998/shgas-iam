import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { LoginLogSelectObjectSchema as LoginLogSelectObjectSchema } from './LoginLogSelect.schema'

const makeSchema = () => z.object({
  select: z.lazy(() => LoginLogSelectObjectSchema).optional()
}).strict();
export const LoginLogArgsObjectSchema = makeSchema();
export const LoginLogArgsObjectZodSchema = makeSchema();
