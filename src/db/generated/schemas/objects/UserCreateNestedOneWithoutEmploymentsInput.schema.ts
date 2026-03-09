import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutEmploymentsInputObjectSchema as UserCreateWithoutEmploymentsInputObjectSchema } from './UserCreateWithoutEmploymentsInput.schema';
import { UserUncheckedCreateWithoutEmploymentsInputObjectSchema as UserUncheckedCreateWithoutEmploymentsInputObjectSchema } from './UserUncheckedCreateWithoutEmploymentsInput.schema';
import { UserCreateOrConnectWithoutEmploymentsInputObjectSchema as UserCreateOrConnectWithoutEmploymentsInputObjectSchema } from './UserCreateOrConnectWithoutEmploymentsInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional()
}).strict();
export const UserCreateNestedOneWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserCreateNestedOneWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserCreateNestedOneWithoutEmploymentsInput>;
export const UserCreateNestedOneWithoutEmploymentsInputObjectZodSchema = makeSchema();
