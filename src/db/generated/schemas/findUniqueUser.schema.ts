import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { UserWhereUniqueInputObjectSchema as UserWhereUniqueInputObjectSchema } from './objects/UserWhereUniqueInput.schema';

export const UserFindUniqueSchema: z.ZodType<Prisma.UserFindUniqueArgs> = z.object({   where: UserWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.UserFindUniqueArgs>;

export const UserFindUniqueZodSchema = z.object({   where: UserWhereUniqueInputObjectSchema }).strict();