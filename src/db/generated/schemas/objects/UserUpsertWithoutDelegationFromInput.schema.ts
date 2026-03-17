import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserUpdateWithoutDelegationFromInputObjectSchema as UserUpdateWithoutDelegationFromInputObjectSchema } from './UserUpdateWithoutDelegationFromInput.schema';
import { UserUncheckedUpdateWithoutDelegationFromInputObjectSchema as UserUncheckedUpdateWithoutDelegationFromInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationFromInput.schema';
import { UserCreateWithoutDelegationFromInputObjectSchema as UserCreateWithoutDelegationFromInputObjectSchema } from './UserCreateWithoutDelegationFromInput.schema';
import { UserUncheckedCreateWithoutDelegationFromInputObjectSchema as UserUncheckedCreateWithoutDelegationFromInputObjectSchema } from './UserUncheckedCreateWithoutDelegationFromInput.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => UserUpdateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationFromInputObjectSchema)]),
  create: z.union([z.lazy(() => UserCreateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationFromInputObjectSchema)]),
  where: z.lazy(() => UserWhereInputObjectSchema).optional()
}).strict();
export const UserUpsertWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserUpsertWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpsertWithoutDelegationFromInput>;
export const UserUpsertWithoutDelegationFromInputObjectZodSchema = makeSchema();
