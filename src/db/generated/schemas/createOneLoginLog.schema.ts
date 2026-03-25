import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogSelectObjectSchema as LoginLogSelectObjectSchema } from './objects/LoginLogSelect.schema';
import { LoginLogCreateInputObjectSchema as LoginLogCreateInputObjectSchema } from './objects/LoginLogCreateInput.schema';
import { LoginLogUncheckedCreateInputObjectSchema as LoginLogUncheckedCreateInputObjectSchema } from './objects/LoginLogUncheckedCreateInput.schema';

export const LoginLogCreateOneSchema: z.ZodType<Prisma.LoginLogCreateArgs> = z.object({ select: LoginLogSelectObjectSchema.optional(),  data: z.union([LoginLogCreateInputObjectSchema, LoginLogUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.LoginLogCreateArgs>;

export const LoginLogCreateOneZodSchema = z.object({ select: LoginLogSelectObjectSchema.optional(),  data: z.union([LoginLogCreateInputObjectSchema, LoginLogUncheckedCreateInputObjectSchema]) }).strict();