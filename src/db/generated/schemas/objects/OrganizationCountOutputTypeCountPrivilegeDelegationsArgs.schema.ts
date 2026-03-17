import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './PrivilegeDelegationWhereInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => PrivilegeDelegationWhereInputObjectSchema).optional()
}).strict();
export const OrganizationCountOutputTypeCountPrivilegeDelegationsArgsObjectSchema = makeSchema();
export const OrganizationCountOutputTypeCountPrivilegeDelegationsArgsObjectZodSchema = makeSchema();
