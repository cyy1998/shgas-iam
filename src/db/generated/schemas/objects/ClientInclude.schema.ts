import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleFindManySchema as RoleFindManySchema } from '../findManyRole.schema';
import { ClientCountOutputTypeArgsObjectSchema as ClientCountOutputTypeArgsObjectSchema } from './ClientCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  roles: z.union([z.boolean(), z.lazy(() => RoleFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => ClientCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const ClientIncludeObjectSchema: z.ZodType<Prisma.ClientInclude> = makeSchema() as unknown as z.ZodType<Prisma.ClientInclude>;
export const ClientIncludeObjectZodSchema = makeSchema();
