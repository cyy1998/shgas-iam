import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogUncheckedCreateInputObjectSchema as LoginLogUncheckedCreateInputObjectSchema } from './objects/LoginLogUncheckedCreateInput.schema';

export const LoginLogCreateOneSchema: z.ZodType<Prisma.LoginLogCreateArgs> = z.object({   data: LoginLogUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogCreateArgs>;

export const LoginLogCreateOneZodSchema = z.object({   data: LoginLogUncheckedCreateInputObjectSchema }).strict();