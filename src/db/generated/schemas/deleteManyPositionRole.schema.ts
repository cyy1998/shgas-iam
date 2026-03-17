import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './objects/PositionRoleWhereInput.schema';

export const PositionRoleDeleteManySchema: z.ZodType<Prisma.PositionRoleDeleteManyArgs> = z.object({ where: PositionRoleWhereInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.PositionRoleDeleteManyArgs>;

export const PositionRoleDeleteManyZodSchema = z.object({ where: PositionRoleWhereInputObjectSchema.optional() }).strict();