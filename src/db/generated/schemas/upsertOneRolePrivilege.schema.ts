import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RolePrivilegeSelectObjectSchema as RolePrivilegeSelectObjectSchema } from './objects/RolePrivilegeSelect.schema';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './objects/RolePrivilegeInclude.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeCreateInputObjectSchema as RolePrivilegeCreateInputObjectSchema } from './objects/RolePrivilegeCreateInput.schema';
import { RolePrivilegeUncheckedCreateInputObjectSchema as RolePrivilegeUncheckedCreateInputObjectSchema } from './objects/RolePrivilegeUncheckedCreateInput.schema';
import { RolePrivilegeUpdateInputObjectSchema as RolePrivilegeUpdateInputObjectSchema } from './objects/RolePrivilegeUpdateInput.schema';
import { RolePrivilegeUncheckedUpdateInputObjectSchema as RolePrivilegeUncheckedUpdateInputObjectSchema } from './objects/RolePrivilegeUncheckedUpdateInput.schema';

export const RolePrivilegeUpsertOneSchema: z.ZodType<Prisma.RolePrivilegeUpsertArgs> = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), where: RolePrivilegeWhereUniqueInputObjectSchema, create: z.union([ RolePrivilegeCreateInputObjectSchema, RolePrivilegeUncheckedCreateInputObjectSchema ]), update: z.union([ RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeUpsertArgs>;

export const RolePrivilegeUpsertOneZodSchema = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), where: RolePrivilegeWhereUniqueInputObjectSchema, create: z.union([ RolePrivilegeCreateInputObjectSchema, RolePrivilegeUncheckedCreateInputObjectSchema ]), update: z.union([ RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema ]) }).strict();