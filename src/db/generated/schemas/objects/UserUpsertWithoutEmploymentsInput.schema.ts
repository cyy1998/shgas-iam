import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserUpdateWithoutEmploymentsInputObjectSchema as UserUpdateWithoutEmploymentsInputObjectSchema } from './UserUpdateWithoutEmploymentsInput.schema';
import { UserUncheckedUpdateWithoutEmploymentsInputObjectSchema as UserUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './UserUncheckedUpdateWithoutEmploymentsInput.schema';
import { UserCreateWithoutEmploymentsInputObjectSchema as UserCreateWithoutEmploymentsInputObjectSchema } from './UserCreateWithoutEmploymentsInput.schema';
import { UserUncheckedCreateWithoutEmploymentsInputObjectSchema as UserUncheckedCreateWithoutEmploymentsInputObjectSchema } from './UserUncheckedCreateWithoutEmploymentsInput.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema'

const makeSchema = () => z.object({
  update: z.union([z.lazy(() => UserUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutEmploymentsInputObjectSchema)]),
  create: z.union([z.lazy(() => UserCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutEmploymentsInputObjectSchema)]),
  where: z.lazy(() => UserWhereInputObjectSchema).optional()
}).strict();
export const UserUpsertWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserUpsertWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpsertWithoutEmploymentsInput>;
export const UserUpsertWithoutEmploymentsInputObjectZodSchema = makeSchema();
