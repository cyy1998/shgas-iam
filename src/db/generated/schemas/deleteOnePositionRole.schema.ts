import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './objects/PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';

export const PositionRoleDeleteOneSchema: z.ZodType<Prisma.PositionRoleDeleteArgs> = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionRoleDeleteArgs>;

export const PositionRoleDeleteOneZodSchema = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema }).strict();