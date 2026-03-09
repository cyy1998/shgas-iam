import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { UserUpdateWithoutDelegationToInputObjectSchema as UserUpdateWithoutDelegationToInputObjectSchema } from './UserUpdateWithoutDelegationToInput.schema';
import { UserUncheckedUpdateWithoutDelegationToInputObjectSchema as UserUncheckedUpdateWithoutDelegationToInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationToInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => UserUpdateWithoutDelegationToInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationToInputObjectSchema)])
}).strict();
export const UserUpdateToOneWithWhereWithoutDelegationToInputObjectSchema: z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutDelegationToInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutDelegationToInput>;
export const UserUpdateToOneWithWhereWithoutDelegationToInputObjectZodSchema = makeSchema();
