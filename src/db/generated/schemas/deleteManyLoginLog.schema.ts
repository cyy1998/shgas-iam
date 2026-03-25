import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogWhereInputObjectSchema as LoginLogWhereInputObjectSchema } from './objects/LoginLogWhereInput.schema';

export const LoginLogDeleteManySchema: z.ZodType<Prisma.LoginLogDeleteManyArgs> = z.object({ where: LoginLogWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.LoginLogDeleteManyArgs>;

export const LoginLogDeleteManyZodSchema = z.object({ where: LoginLogWhereInputObjectSchema.optional() }).strict();