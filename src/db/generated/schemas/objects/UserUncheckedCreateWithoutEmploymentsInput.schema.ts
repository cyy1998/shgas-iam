import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInputObjectSchema as PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInputObjectSchema } from './PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInput.schema';
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
  delegationTo: z.lazy(() => PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegatorUserInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationUncheckedCreateNestedManyWithoutDelegateeUserInputObjectSchema).optional()
}).strict();
export const UserUncheckedCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserUncheckedCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUncheckedCreateWithoutEmploymentsInput>;
export const UserUncheckedCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
