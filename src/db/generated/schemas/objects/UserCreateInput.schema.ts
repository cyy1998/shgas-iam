import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutUserInputObjectSchema as EmploymentCreateNestedManyWithoutUserInputObjectSchema } from './EmploymentCreateNestedManyWithoutUserInput.schema';
import { PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput.schema';
import { PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  username: z.string().max(64),
  wxId: z.string().max(255).optional().nullable(),
  name: z.string().max(64),
  password: z.string().max(255).optional().nullable(),
  mobile: z.string().max(20).optional().nullable(),
  userType: z.string().max(20).optional(),
  orderNum: z.number().int().optional(),
  status: z.number().int().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentCreateNestedManyWithoutUserInputObjectSchema).optional(),
  delegationTo: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInputObjectSchema).optional()
}).strict();
export const UserCreateInputObjectSchema: z.ZodType<Prisma.UserCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateInput>;
export const UserCreateInputObjectZodSchema = makeSchema();
