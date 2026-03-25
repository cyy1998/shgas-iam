import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogSelectObjectSchema as LoginLogSelectObjectSchema } from './objects/LoginLogSelect.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';
import { LoginLogCreateInputObjectSchema as LoginLogCreateInputObjectSchema } from './objects/LoginLogCreateInput.schema';
import { LoginLogUncheckedCreateInputObjectSchema as LoginLogUncheckedCreateInputObjectSchema } from './objects/LoginLogUncheckedCreateInput.schema';
import { LoginLogUpdateInputObjectSchema as LoginLogUpdateInputObjectSchema } from './objects/LoginLogUpdateInput.schema';
import { LoginLogUncheckedUpdateInputObjectSchema as LoginLogUncheckedUpdateInputObjectSchema } from './objects/LoginLogUncheckedUpdateInput.schema';

export const LoginLogUpsertOneSchema: z.ZodType<Prisma.LoginLogUpsertArgs> = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema, create: z.union([ LoginLogCreateInputObjectSchema, LoginLogUncheckedCreateInputObjectSchema ]), update: z.union([ LoginLogUpdateInputObjectSchema, LoginLogUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.LoginLogUpsertArgs>;

export const LoginLogUpsertOneZodSchema = z.object({ select: LoginLogSelectObjectSchema.optional(),  where: LoginLogWhereUniqueInputObjectSchema, create: z.union([ LoginLogCreateInputObjectSchema, LoginLogUncheckedCreateInputObjectSchema ]), update: z.union([ LoginLogUpdateInputObjectSchema, LoginLogUncheckedUpdateInputObjectSchema ]) }).strict();