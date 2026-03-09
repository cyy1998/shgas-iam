import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserCreateWithoutEmploymentsInputObjectSchema as UserCreateWithoutEmploymentsInputObjectSchema } from './UserCreateWithoutEmploymentsInput.schema';
import { UserUncheckedCreateWithoutEmploymentsInputObjectSchema as UserUncheckedCreateWithoutEmploymentsInputObjectSchema } from './UserUncheckedCreateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereUniqueInputObjectSchema),
  create: z.union([z.lazy(() => UserCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const UserCreateOrConnectWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserCreateOrConnectWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateOrConnectWithoutEmploymentsInput>;
export const UserCreateOrConnectWithoutEmploymentsInputObjectZodSchema = makeSchema();
