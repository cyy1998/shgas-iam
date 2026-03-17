import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutDelegationToInputObjectSchema as UserCreateWithoutDelegationToInputObjectSchema } from './UserCreateWithoutDelegationToInput.schema';
import { UserUncheckedCreateWithoutDelegationToInputObjectSchema as UserUncheckedCreateWithoutDelegationToInputObjectSchema } from './UserUncheckedCreateWithoutDelegationToInput.schema';
import { UserCreateOrConnectWithoutDelegationToInputObjectSchema as UserCreateOrConnectWithoutDelegationToInputObjectSchema } from './UserCreateOrConnectWithoutDelegationToInput.schema';
import { UserUpsertWithoutDelegationToInputObjectSchema as UserUpsertWithoutDelegationToInputObjectSchema } from './UserUpsertWithoutDelegationToInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateToOneWithWhereWithoutDelegationToInputObjectSchema as UserUpdateToOneWithWhereWithoutDelegationToInputObjectSchema } from './UserUpdateToOneWithWhereWithoutDelegationToInput.schema';
import { UserUpdateWithoutDelegationToInputObjectSchema as UserUpdateWithoutDelegationToInputObjectSchema } from './UserUpdateWithoutDelegationToInput.schema';
import { UserUncheckedUpdateWithoutDelegationToInputObjectSchema as UserUncheckedUpdateWithoutDelegationToInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationToInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationToInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutDelegationToInputObjectSchema).optional(),
  upsert: z.lazy(() => UserUpsertWithoutDelegationToInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => UserUpdateToOneWithWhereWithoutDelegationToInputObjectSchema), z.lazy(() => UserUpdateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationToInputObjectSchema)]).optional()
}).strict();
export const UserUpdateOneRequiredWithoutDelegationToNestedInputObjectSchema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutDelegationToNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateOneRequiredWithoutDelegationToNestedInput>;
export const UserUpdateOneRequiredWithoutDelegationToNestedInputObjectZodSchema = makeSchema();
