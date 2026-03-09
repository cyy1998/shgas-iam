import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutDelegationFromInputObjectSchema as UserCreateWithoutDelegationFromInputObjectSchema } from './UserCreateWithoutDelegationFromInput.schema';
import { UserUncheckedCreateWithoutDelegationFromInputObjectSchema as UserUncheckedCreateWithoutDelegationFromInputObjectSchema } from './UserUncheckedCreateWithoutDelegationFromInput.schema';
import { UserCreateOrConnectWithoutDelegationFromInputObjectSchema as UserCreateOrConnectWithoutDelegationFromInputObjectSchema } from './UserCreateOrConnectWithoutDelegationFromInput.schema';
import { UserUpsertWithoutDelegationFromInputObjectSchema as UserUpsertWithoutDelegationFromInputObjectSchema } from './UserUpsertWithoutDelegationFromInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateToOneWithWhereWithoutDelegationFromInputObjectSchema as UserUpdateToOneWithWhereWithoutDelegationFromInputObjectSchema } from './UserUpdateToOneWithWhereWithoutDelegationFromInput.schema';
import { UserUpdateWithoutDelegationFromInputObjectSchema as UserUpdateWithoutDelegationFromInputObjectSchema } from './UserUpdateWithoutDelegationFromInput.schema';
import { UserUncheckedUpdateWithoutDelegationFromInputObjectSchema as UserUncheckedUpdateWithoutDelegationFromInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationFromInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationFromInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutDelegationFromInputObjectSchema).optional(),
  upsert: z.lazy(() => UserUpsertWithoutDelegationFromInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => UserUpdateToOneWithWhereWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUpdateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationFromInputObjectSchema)]).optional()
}).strict();
export const UserUpdateOneRequiredWithoutDelegationFromNestedInputObjectSchema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutDelegationFromNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateOneRequiredWithoutDelegationFromNestedInput>;
export const UserUpdateOneRequiredWithoutDelegationFromNestedInputObjectZodSchema = makeSchema();
