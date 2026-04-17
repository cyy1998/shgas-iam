import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';

export const LoginLogDeleteOneSchema: z.ZodType<Prisma.LoginLogDeleteArgs> = z.object({   where: LoginLogWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogDeleteArgs>;

export const LoginLogDeleteOneZodSchema = z.object({   where: LoginLogWhereUniqueInputObjectSchema }).strict();