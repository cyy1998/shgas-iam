import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './objects/PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleCreateInputObjectSchema as PositionRoleCreateInputObjectSchema } from './objects/PositionRoleCreateInput.schema';
import { PositionRoleUncheckedCreateInputObjectSchema as PositionRoleUncheckedCreateInputObjectSchema } from './objects/PositionRoleUncheckedCreateInput.schema';

export const PositionRoleCreateOneSchema: z.ZodType<Prisma.PositionRoleCreateArgs> = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), data: z.union([PositionRoleCreateInputObjectSchema, PositionRoleUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.PositionRoleCreateArgs>;

export const PositionRoleCreateOneZodSchema = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), data: z.union([PositionRoleCreateInputObjectSchema, PositionRoleUncheckedCreateInputObjectSchema]) }).strict();