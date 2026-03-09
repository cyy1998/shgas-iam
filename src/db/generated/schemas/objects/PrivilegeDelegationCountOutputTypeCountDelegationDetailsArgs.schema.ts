import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './DelegationDetailWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgsObjectSchema = makeSchema();
export const PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgsObjectZodSchema = makeSchema();
