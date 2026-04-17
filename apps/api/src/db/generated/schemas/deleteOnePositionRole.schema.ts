import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';

export const PositionRoleDeleteOneSchema: z.ZodType<Prisma.PositionRoleDeleteArgs> = z.object({   where: PositionRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionRoleDeleteArgs>;

export const PositionRoleDeleteOneZodSchema = z.object({   where: PositionRoleWhereUniqueInputObjectSchema }).strict();