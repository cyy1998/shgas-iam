import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { UserUncheckedCreateInputObjectSchema as UserUncheckedCreateInputObjectSchema } from './objects/UserUncheckedCreateInput.schema';

export const UserCreateOneSchema: z.ZodType<Prisma.UserCreateArgs> = z.object({   data: UserUncheckedCreateInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.UserCreateArgs>;

export const UserCreateOneZodSchema = z.object({   data: UserUncheckedCreateInputObjectSchema }).strict();