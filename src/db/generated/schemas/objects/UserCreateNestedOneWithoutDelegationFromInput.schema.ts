import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutDelegationFromInputObjectSchema as UserCreateWithoutDelegationFromInputObjectSchema } from './UserCreateWithoutDelegationFromInput.schema';
import { UserUncheckedCreateWithoutDelegationFromInputObjectSchema as UserUncheckedCreateWithoutDelegationFromInputObjectSchema } from './UserUncheckedCreateWithoutDelegationFromInput.schema';
import { UserCreateOrConnectWithoutDelegationFromInputObjectSchema as UserCreateOrConnectWithoutDelegationFromInputObjectSchema } from './UserCreateOrConnectWithoutDelegationFromInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationFromInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutDelegationFromInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional()
}).strict();
export const UserCreateNestedOneWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserCreateNestedOneWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateNestedOneWithoutDelegationFromInput>;
export const UserCreateNestedOneWithoutDelegationFromInputObjectZodSchema = makeSchema();
