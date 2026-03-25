import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogSelectObjectSchema as LoginLogSelectObjectSchema } from './objects/LoginLogSelect.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';

export const LoginLogFindUniqueOrThrowSchema: z.ZodType<Prisma.LoginLogFindUniqueOrThrowArgs> = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogFindUniqueOrThrowArgs>;

export const LoginLogFindUniqueOrThrowZodSchema = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema }).strict();