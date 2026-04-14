import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';

export const LoginLogFindUniqueSchema: z.ZodType<Prisma.LoginLogFindUniqueArgs> = z.object({   where: LoginLogWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogFindUniqueArgs>;

export const LoginLogFindUniqueZodSchema = z.object({   where: LoginLogWhereUniqueInputObjectSchema }).strict();