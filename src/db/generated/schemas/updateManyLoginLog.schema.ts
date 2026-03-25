import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogUpdateManyMutationInputObjectSchema as LoginLogUpdateManyMutationInputObjectSchema } from './objects/LoginLogUpdateManyMutationInput.schema';
import { LoginLogWhereInputObjectSchema as LoginLogWhereInputObjectSchema } from './objects/LoginLogWhereInput.schema';

export const LoginLogUpdateManySchema: z.ZodType<Prisma.LoginLogUpdateManyArgs> = z.object({ data: LoginLogUpdateManyMutationInputObjectSchema, where: LoginLogWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.LoginLogUpdateManyArgs>;

export const LoginLogUpdateManyZodSchema = z.object({ data: LoginLogUpdateManyMutationInputObjectSchema, where: LoginLogWhereInputObjectSchema.optional() }).strict();