import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogUpdateInputObjectSchema as LoginLogUpdateInputObjectSchema } from './objects/LoginLogUpdateInput.schema';
import { LoginLogUncheckedUpdateInputObjectSchema as LoginLogUncheckedUpdateInputObjectSchema } from './objects/LoginLogUncheckedUpdateInput.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';

export const LoginLogUpdateOneSchema: z.ZodType<Prisma.LoginLogUpdateArgs> = z.object({   data: z.union([LoginLogUpdateInputObjectSchema, LoginLogUncheckedUpdateInputObjectSchema]), where: LoginLogWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.LoginLogUpdateArgs>;

export const LoginLogUpdateOneZodSchema = z.object({   data: z.union([LoginLogUpdateInputObjectSchema, LoginLogUncheckedUpdateInputObjectSchema]), where: LoginLogWhereUniqueInputObjectSchema }).strict();