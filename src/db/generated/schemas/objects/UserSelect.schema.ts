import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentFindManySchema as EmploymentFindManySchema } from '../findManyEmployment.schema';
import { PrivilegeDelegationFindManySchema as PrivilegeDelegationFindManySchema } from '../findManyPrivilegeDelegation.schema';
import { UserCountOutputTypeArgsObjectSchema as UserCountOutputTypeArgsObjectSchema } from './UserCountOutputTypeArgs.schema'

const makeSchema = () => z.object({
  id: z.boolean().optional(),
  username: z.boolean().optional(),
  wxId: z.boolean().optional(),
  name: z.boolean().optional(),
  password: z.boolean().optional(),
  mobile: z.boolean().optional(),
  userType: z.boolean().optional(),
  orderNum: z.boolean().optional(),
  status: z.boolean().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.boolean().optional(),
  updateTime: z.boolean().optional(),
  employments: z.union([z.boolean(), z.lazy(() => EmploymentFindManySchema)]).optional(),
  delegationTo: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationFindManySchema)]).optional(),
  delegationFrom: z.union([z.boolean(), z.lazy(() => PrivilegeDelegationFindManySchema)]).optional(),
  _count: z.union([z.boolean(), z.lazy(() => UserCountOutputTypeArgsObjectSchema)]).optional()
}).strict();
export const UserSelectObjectSchema: z.ZodType<Prisma.UserSelect> = makeSchema() as unknown as z.ZodType<Prisma.UserSelect>;
export const UserSelectObjectZodSchema = makeSchema();
