import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserCreateWithoutDelegationFromInputObjectSchema as UserCreateWithoutDelegationFromInputObjectSchema } from './UserCreateWithoutDelegationFromInput.schema';
import { UserUncheckedCreateWithoutDelegationFromInputObjectSchema as UserUncheckedCreateWithoutDelegationFromInputObjectSchema } from './UserUncheckedCreateWithoutDelegationFromInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => UserCreateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationFromInputObjectSchema)])
}).strict();
export const UserCreateOrConnectWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserCreateOrConnectWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateOrConnectWithoutDelegationFromInput>;
export const UserCreateOrConnectWithoutDelegationFromInputObjectZodSchema = makeSchema();
