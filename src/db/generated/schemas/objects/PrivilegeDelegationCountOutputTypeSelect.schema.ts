import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgsObjectSchema as PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgsObjectSchema } from './PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgs.schema'

const makeSchema = () => z.object({
  delegationDetails: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationCountOutputTypeCountDelegationDetailsArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeDelegationCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.PrivilegeDelegationCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationCountOutputTypeSelect>;
export const PrivilegeDelegationCountOutputTypeSelectObjectZodSchema = makeSchema();
