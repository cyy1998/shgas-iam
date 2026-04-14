import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';

export const RoleDeleteOneSchema: z.ZodType<Prisma.RoleDeleteArgs> = z.object({   where: RoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RoleDeleteArgs>;

export const RoleDeleteOneZodSchema = z.object({   where: RoleWhereUniqueInputObjectSchema }).strict();