import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserCountOutputTypeCountEmploymentsArgsObjectSchema as UserCountOutputTypeCountEmploymentsArgsObjectSchema } from './UserCountOutputTypeCountEmploymentsArgs.schema';
import { UserCountOutputTypeCountDelegationToArgsObjectSchema as UserCountOutputTypeCountDelegationToArgsObjectSchema } from './UserCountOutputTypeCountDelegationToArgs.schema';
import { UserCountOutputTypeCountDelegationFromArgsObjectSchema as UserCountOutputTypeCountDelegationFromArgsObjectSchema } from './UserCountOutputTypeCountDelegationFromArgs.schema'

const makeSchema = () => z.object({
  employments: z.union([z.boolean(), z.lazy(() => UserCountOutputTypeCountEmploymentsArgsObjectSchema)]).optional(),
  delegationTo: z.union([z.boolean(), z.lazy(() => UserCountOutputTypeCountDelegationToArgsObjectSchema)]).optional(),
  delegationFrom: z.union([z.boolean(), z.lazy(() => UserCountOutputTypeCountDelegationFromArgsObjectSchema)]).optional()
}).strict();
export const UserCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.UserCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.UserCountOutputTypeSelect>;
export const UserCountOutputTypeSelectObjectZodSchema = makeSchema();
