import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { EmploymentUncheckedCreateNestedManyWithoutUserInputObjectSchema as EmploymentUncheckedCreateNestedManyWithoutUserInputObjectSchema } from './EmploymentUncheckedCreateNestedManyWithoutUserInput.schema';
import { PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectSchema as PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInput.schema'

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  username: z.string(),
  wxId: z.string().optional().nullable(),
  name: z.string(),
  password: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  userType: z.string().optional(),
  orderNum: z.number().int().optional(),
  status: z.number().int().optional(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  employments: z.lazy(() => EmploymentUncheckedCreateNestedManyWithoutUserInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectSchema).optional()
}).strict();
export const UserUncheckedCreateWithoutDelegationToInputObjectSchema: z.ZodType<Prisma.UserUncheckedCreateWithoutDelegationToInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUncheckedCreateWithoutDelegationToInput>;
export const UserUncheckedCreateWithoutDelegationToInputObjectZodSchema = makeSchema();
