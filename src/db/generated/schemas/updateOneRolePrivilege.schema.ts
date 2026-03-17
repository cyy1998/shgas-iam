import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeSelectObjectSchema as RolePrivilegeSelectObjectSchema } from './objects/RolePrivilegeSelect.schema';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './objects/RolePrivilegeInclude.schema';
import { RolePrivilegeUpdateInputObjectSchema as RolePrivilegeUpdateInputObjectSchema } from './objects/RolePrivilegeUpdateInput.schema';
import { RolePrivilegeUncheckedUpdateInputObjectSchema as RolePrivilegeUncheckedUpdateInputObjectSchema } from './objects/RolePrivilegeUncheckedUpdateInput.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';

export const RolePrivilegeUpdateOneSchema: z.ZodType<Prisma.RolePrivilegeUpdateArgs> = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), data: z.union([RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema]), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeUpdateArgs>;

export const RolePrivilegeUpdateOneZodSchema = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), data: z.union([RolePrivilegeUpdateInputObjectSchema, RolePrivilegeUncheckedUpdateInputObjectSchema]), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict();