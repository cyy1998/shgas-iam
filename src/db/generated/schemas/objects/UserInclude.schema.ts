import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PrivilegeDelegationFindManySchema as PrivilegeDelegationFindManySchema } from '../findManyPrivilegeDelegation.schema';
import { UserCountOutputTypeArgsObjectSchema as UserCountOutputTypeArgsObjectSchema } from './UserCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  delegationTo: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationFindManySchema)]).optional(),
  delegationFrom: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => UserCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const UserIncludeObjectSchema: z.ZodType<Prisma.UserInclude> = makeSchema() as unknown as z.ZodType<Prisma.UserInclude>;
export const UserIncludeObjectZodSchema = makeSchema();
