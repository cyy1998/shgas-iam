import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserUpdateWithoutDelegationToInputObjectSchema as UserUpdateWithoutDelegationToInputObjectSchema } from './UserUpdateWithoutDelegationToInput.schema';
import { UserUncheckedUpdateWithoutDelegationToInputObjectSchema as UserUncheckedUpdateWithoutDelegationToInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationToInput.schema';
import { UserCreateWithoutDelegationToInputObjectSchema as UserCreateWithoutDelegationToInputObjectSchema } from './UserCreateWithoutDelegationToInput.schema';
import { UserUncheckedCreateWithoutDelegationToInputObjectSchema as UserUncheckedCreateWithoutDelegationToInputObjectSchema } from './UserUncheckedCreateWithoutDelegationToInput.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => UserUpdateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationToInputObjectSchema)]),
  create: z.union([z.lazy(() => UserCreateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationToInputObjectSchema)]),
  where: z.lazy(() => UserWhereInputObjectSchema).optional()
}).strict();
export const UserUpsertWithoutDelegationToInputObjectSchema: z.ZodType<Prisma.UserUpsertWithoutDelegationToInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpsertWithoutDelegationToInput>;
export const UserUpsertWithoutDelegationToInputObjectZodSchema = makeSchema();
