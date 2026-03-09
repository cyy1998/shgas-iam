import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserCreateWithoutDelegationToInputObjectSchema as UserCreateWithoutDelegationToInputObjectSchema } from './UserCreateWithoutDelegationToInput.schema';
import { UserUncheckedCreateWithoutDelegationToInputObjectSchema as UserUncheckedCreateWithoutDelegationToInputObjectSchema } from './UserUncheckedCreateWithoutDelegationToInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => UserCreateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutDelegationToInputObjectSchema)])
}).strict();
export const UserCreateOrConnectWithoutDelegationToInputObjectSchema: z.ZodType<Prisma.UserCreateOrConnectWithoutDelegationToInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateOrConnectWithoutDelegationToInput>;
export const UserCreateOrConnectWithoutDelegationToInputObjectZodSchema = makeSchema();
