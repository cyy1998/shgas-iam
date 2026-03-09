import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { UserUpdateWithoutEmploymentsInputObjectSchema as UserUpdateWithoutEmploymentsInputObjectSchema } from './UserUpdateWithoutEmploymentsInput.schema';
import { UserUncheckedUpdateWithoutEmploymentsInputObjectSchema as UserUncheckedUpdateWithoutEmploymentsInputObjectSchema } from './UserUncheckedUpdateWithoutEmploymentsInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => UserUpdateWithoutEmploymentsInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutEmploymentsInputObjectSchema)])
}).strict();
export const UserUpdateToOneWithWhereWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutEmploymentsInput>;
export const UserUpdateToOneWithWhereWithoutEmploymentsInputObjectZodSchema = makeSchema();
