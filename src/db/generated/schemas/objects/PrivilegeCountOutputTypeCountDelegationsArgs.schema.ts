import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './DelegationDetailWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => DelegationDetailWhereInputObjectSchema).optional()
}).strict();
export const PrivilegeCountOutputTypeCountDelegationsArgsObjectSchema = makeSchema();
export const PrivilegeCountOutputTypeCountDelegationsArgsObjectZodSchema = makeSchema();
