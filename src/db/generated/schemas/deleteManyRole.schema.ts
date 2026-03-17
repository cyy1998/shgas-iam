import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './objects/RoleWhereInput.schema';

export const RoleDeleteManySchema: z.ZodType<Prisma.RoleDeleteManyArgs> = z.object({ where: RoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.RoleDeleteManyArgs>;

export const RoleDeleteManyZodSchema = z.object({ where: RoleWhereInputObjectSchema.optional() }).strict();