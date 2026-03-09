import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutDelegationToInputObjectSchema as UserCreateWithoutDelegationToInputObjectSchema } from './UserCreateWithoutDelegationToInput.schema';
import { UserUncheckedCreateWithoutDelegationToInputObjectSchema as UserUncheckedCreateWithoutDelegationToInputObjectSchema } from './UserUncheckedCreateWithoutDelegationToInput.schema';
import { UserCreateOrConnectWithoutDelegationToInputObjectSchema as UserCreateOrConnectWithoutDelegationToInputObjectSchema } from './UserCreateOrConnectWithoutDelegationToInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationToInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutDelegationToInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional()
}).strict();
export const UserCreateNestedOneWithoutDelegationToInputObjectSchema: z.ZodType<Prisma.UserCreateNestedOneWithoutDelegationToInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateNestedOneWithoutDelegationToInput>;
export const UserCreateNestedOneWithoutDelegationToInputObjectZodSchema = makeSchema();
