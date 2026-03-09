import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
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
  delegationTo: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutDelegatorUserInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationCreateNestedManyWithoutDelegateeUserInputObjectSchema).optional()
}).strict();
export const UserCreateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserCreateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateWithoutEmploymentsInput>;
export const UserCreateWithoutEmploymentsInputObjectZodSchema = makeSchema();
