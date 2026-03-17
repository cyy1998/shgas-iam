import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './objects/PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleUpdateInputObjectSchema as PositionRoleUpdateInputObjectSchema } from './objects/PositionRoleUpdateInput.schema';
import { PositionRoleUncheckedUpdateInputObjectSchema as PositionRoleUncheckedUpdateInputObjectSchema } from './objects/PositionRoleUncheckedUpdateInput.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';

export const PositionRoleUpdateOneSchema: z.ZodType<Prisma.PositionRoleUpdateArgs> = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), data: z.union([PositionRoleUpdateInputObjectSchema, PositionRoleUncheckedUpdateInputObjectSchema]), where: PositionRoleWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PositionRoleUpdateArgs>;

export const PositionRoleUpdateOneZodSchema = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), data: z.union([PositionRoleUpdateInputObjectSchema, PositionRoleUncheckedUpdateInputObjectSchema]), where: PositionRoleWhereUniqueInputObjectSchema }).strict();