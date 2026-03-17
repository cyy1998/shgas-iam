import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeCountOutputTypeCountRolesArgsObjectSchema as PrivilegeCountOutputTypeCountRolesArgsObjectSchema } from './PrivilegeCountOutputTypeCountRolesArgs.schema';
import { PrivilegeCountOutputTypeCountDelegationsArgsObjectSchema as PrivilegeCountOutputTypeCountDelegationsArgsObjectSchema } from './PrivilegeCountOutputTypeCountDelegationsArgs.schema'

const makeSchema = () => z.object({
  roles: z.union([z.boolean(), z.lazy(() => PrivilegeCountOutputTypeCountRolesArgsObjectSchema)]).optional(),
  delegations: z.union([z.boolean(), z.lazy(() => PrivilegeCountOutputTypeCountDelegationsArgsObjectSchema)]).optional()
}).strict();
export const PrivilegeCountOutputTypeSelectObjectSchema: z.ZodType<Prisma.PrivilegeCountOutputTypeSelect> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCountOutputTypeSelect>;
export const PrivilegeCountOutputTypeSelectObjectZodSchema = makeSchema();
