import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleSelectObjectSchema as PositionRoleSelectObjectSchema } from './objects/PositionRoleSelect.schema';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';
import { PositionRoleCreateInputObjectSchema as PositionRoleCreateInputObjectSchema } from './objects/PositionRoleCreateInput.schema';
import { PositionRoleUncheckedCreateInputObjectSchema as PositionRoleUncheckedCreateInputObjectSchema } from './objects/PositionRoleUncheckedCreateInput.schema';
import { PositionRoleUpdateInputObjectSchema as PositionRoleUpdateInputObjectSchema } from './objects/PositionRoleUpdateInput.schema';
import { PositionRoleUncheckedUpdateInputObjectSchema as PositionRoleUncheckedUpdateInputObjectSchema } from './objects/PositionRoleUncheckedUpdateInput.schema';

export const PositionRoleUpsertOneSchema: z.ZodType<Prisma.PositionRoleUpsertArgs> = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema, create: z.union([ PositionRoleCreateInputObjectSchema, PositionRoleUncheckedCreateInputObjectSchema ]), update: z.union([ PositionRoleUpdateInputObjectSchema, PositionRoleUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PositionRoleUpsertArgs>;

export const PositionRoleUpsertOneZodSchema = z.object({ select: PositionRoleSelectObjectSchema.optional(), include: PositionRoleIncludeObjectSchema.optional(), where: PositionRoleWhereUniqueInputObjectSchema, create: z.union([ PositionRoleCreateInputObjectSchema, PositionRoleUncheckedCreateInputObjectSchema ]), update: z.union([ PositionRoleUpdateInputObjectSchema, PositionRoleUncheckedUpdateInputObjectSchema ]) }).strict();