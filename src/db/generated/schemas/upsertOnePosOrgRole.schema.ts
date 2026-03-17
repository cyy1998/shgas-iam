import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleSelectObjectSchema as PosOrgRoleSelectObjectSchema } from './objects/PosOrgRoleSelect.schema';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleCreateInputObjectSchema as PosOrgRoleCreateInputObjectSchema } from './objects/PosOrgRoleCreateInput.schema';
import { PosOrgRoleUncheckedCreateInputObjectSchema as PosOrgRoleUncheckedCreateInputObjectSchema } from './objects/PosOrgRoleUncheckedCreateInput.schema';
import { PosOrgRoleUpdateInputObjectSchema as PosOrgRoleUpdateInputObjectSchema } from './objects/PosOrgRoleUpdateInput.schema';
import { PosOrgRoleUncheckedUpdateInputObjectSchema as PosOrgRoleUncheckedUpdateInputObjectSchema } from './objects/PosOrgRoleUncheckedUpdateInput.schema';

export const PosOrgRoleUpsertOneSchema: z.ZodType<Prisma.PosOrgRoleUpsertArgs> = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema, create: z.union([ PosOrgRoleCreateInputObjectSchema, PosOrgRoleUncheckedCreateInputObjectSchema ]), update: z.union([ PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleUpsertArgs>;

export const PosOrgRoleUpsertOneZodSchema = z.object({ select: PosOrgRoleSelectObjectSchema.optional(), include: PosOrgRoleIncludeObjectSchema.optional(), where: PosOrgRoleWhereUniqueInputObjectSchema, create: z.union([ PosOrgRoleCreateInputObjectSchema, PosOrgRoleUncheckedCreateInputObjectSchema ]), update: z.union([ PosOrgRoleUpdateInputObjectSchema, PosOrgRoleUncheckedUpdateInputObjectSchema ]) }).strict();