import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional()
}).strict();
export const UserCountOutputTypeCountDelegationToArgsObjectSchema = makeSchema();
export const UserCountOutputTypeCountDelegationToArgsObjectZodSchema = makeSchema();
