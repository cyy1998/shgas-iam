import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { UserUpdateManyMutationInputObjectSchema as UserUpdateManyMutationInputObjectSchema } from './objects/UserUpdateManyMutationInput.schema';
import { UserWhereInputObjectSchema as UserWhereInputObjectSchema } from './objects/UserWhereInput.schema';

export const UserUpdateManySchema: z.ZodType<Prisma.UserUpdateManyArgs> = z.object({ data: UserUpdateManyMutationInputObjectSchema, where: UserWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.UserUpdateManyArgs>;

export const UserUpdateManyZodSchema = z.object({ data: UserUpdateManyMutationInputObjectSchema, where: UserWhereInputObjectSchema.optional() }).strict();