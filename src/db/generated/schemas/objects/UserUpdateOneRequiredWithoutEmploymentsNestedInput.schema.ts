import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { UserCreateWithoutEmploymentsInputObjectSchema as UserCreateWithoutEmploymentsInputObjectSchema } from './UserCreateWithoutEmploymentsInput.schema';
import { UserUncheckedCreateWithoutEmploymentsInputObjectSchema as UserUncheckedCreateWithoutEmploymentsInputObjectSchema } from './UserUncheckedCreateWithoutEmploymentsInput.schema';
import { UserCreateOrConnectWithoutEmploymentsInputObjectSchema as UserCreateOrConnectWithoutEmploymentsInputObjectSchema } from './UserCreateOrConnectWithoutEmploymentsInput.schema';
import { UserUpsertWithoutEmploymentsInputObjectSchema as UserUpsertWithoutEmploymentsInputObjectSchema } from './UserUpsertWithoutEmploymentsInput.schema';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './UserWhereUniqueInput.schema';
import { UserUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema as UserUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema } from './UserUpdateToOneWithWhereWithoutEmploymentsInput.schema';
import { UserUpdateWithoutEmploymentsInputObjectSchema as UserUpdateWithoutEmploymentsInputObjectSchema } from './UserUpdateWithoutEmploymentsInput.schema';
import { UserUncheckedUpdateWithoutEmploymentsInputObjectSchema as UserUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './UserUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  create: z.union([z.lazy(() => UserCreateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedCreateWithoutEmploymentsInputObjectSchema)]).optional(),
  connectOrCreate: z.lazy(() => UserCreateOrConnectWithoutEmploymentsInputObjectSchema).optional(),
  upsert: z.lazy(() => UserUpsertWithoutEmploymentsInputObjectSchema).optional(),
  connect: z.lazy(() => UserWhereUniqueInputObjectSchema).optional(),
  update: z.union([z.lazy(() => UserUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutEmploymentsInputObjectSchema)]).optional()
}).strict();
export const UserUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema: z.ZodType<Prisma.UserUpdateOneRequiredWithoutEmploymentsNestedInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateOneRequiredWithoutEmploymentsNestedInput>;
export const UserUpdateOneRequiredWithoutEmploymentsNestedInputObjectZodSchema = makeSchema();
