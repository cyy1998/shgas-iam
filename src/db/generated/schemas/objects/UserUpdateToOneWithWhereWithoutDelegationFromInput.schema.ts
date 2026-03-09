import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './UserWhereInput.schema';
import { UserUpdateWithoutDelegationFromInputObjectSchema as UserUpdateWithoutDelegationFromInputObjectSchema } from './UserUpdateWithoutDelegationFromInput.schema';
import { UserUncheckedUpdateWithoutDelegationFromInputObjectSchema as UserUncheckedUpdateWithoutDelegationFromInputObjectSchema } from './UserUncheckedUpdateWithoutDelegationFromInput.schema'

const makeSchema = () => z.object({
  where: z.lazy(() => UserWhereInputObjectSchema).optional(),
  data: z.union([z.lazy(() => UserUpdateWithoutDelegationFromInputObjectSchema), z.lazy(() => UserUncheckedUpdateWithoutDelegationFromInputObjectSchema)])
}).strict();
export const UserUpdateToOneWithWhereWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateToOneWithWhereWithoutDelegationFromInput>;
export const UserUpdateToOneWithWhereWithoutDelegationFromInputObjectZodSchema = makeSchema();
