import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentCreateNestedManyWithoutUserInputObjectSchema as EmploymentCreateNestedManyWithoutUserInputObjectSchema } from './EmploymentCreateNestedManyWithoutUserInput.schema';
import { PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInput.schema'

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
  delegationTo: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema).optional()
}).strict();
export const UserCreateWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserCreateWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateWithoutDelegationFromInput>;
export const UserCreateWithoutDelegationFromInputObjectZodSchema = makeSchema();
