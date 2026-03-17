import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleSelectObjectSchema as RoleSelectObjectSchema } from './objects/RoleSelect.schema';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';
import { RoleCreateInputObjectSchema as RoleCreateInputObjectSchema } from './objects/RoleCreateInput.schema';
import { RoleUncheckedCreateInputObjectSchema as RoleUncheckedCreateInputObjectSchema } from './objects/RoleUncheckedCreateInput.schema';
import { RoleUpdateInputObjectSchema as RoleUpdateInputObjectSchema } from './objects/RoleUpdateInput.schema';
import { RoleUncheckedUpdateInputObjectSchema as RoleUncheckedUpdateInputObjectSchema } from './objects/RoleUncheckedUpdateInput.schema';

export const RoleUpsertOneSchema: z.ZodType<Prisma.RoleUpsertArgs> = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema, create: z.union([ RoleCreateInputObjectSchema, RoleUncheckedCreateInputObjectSchema ]), update: z.union([ RoleUpdateInputObjectSchema, RoleUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.RoleUpsertArgs>;

export const RoleUpsertOneZodSchema = z.object({ select: RoleSelectObjectSchema.optional(), include: RoleIncludeObjectSchema.optional(), where: RoleWhereUniqueInputObjectSchema, create: z.union([ RoleCreateInputObjectSchema, RoleUncheckedCreateInputObjectSchema ]), update: z.union([ RoleUpdateInputObjectSchema, RoleUncheckedUpdateInputObjectSchema ]) }).strict();