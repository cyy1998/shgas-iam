import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogSelectObjectSchema as LoginLogSelectObjectSchema } from './objects/LoginLogSelect.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';

export const LoginLogFindUniqueSchema: z.ZodType<Prisma.LoginLogFindUniqueArgs> = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogFindUniqueArgs>;

export const LoginLogFindUniqueZodSchema = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema }).strict();