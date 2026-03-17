import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeSelectObjectSchema as RolePrivilegeSelectObjectSchema } from './objects/RolePrivilegeSelect.schema';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './objects/RolePrivilegeInclude.schema';
import { RolePrivilegeCreateInputObjectSchema as RolePrivilegeCreateInputObjectSchema } from './objects/RolePrivilegeCreateInput.schema';
import { RolePrivilegeUncheckedCreateInputObjectSchema as RolePrivilegeUncheckedCreateInputObjectSchema } from './objects/RolePrivilegeUncheckedCreateInput.schema';

export const RolePrivilegeCreateOneSchema: z.ZodType<Prisma.RolePrivilegeCreateArgs> = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), data: z.union([RolePrivilegeCreateInputObjectSchema, RolePrivilegeUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeCreateArgs>;

export const RolePrivilegeCreateOneZodSchema = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), data: z.union([RolePrivilegeCreateInputObjectSchema, RolePrivilegeUncheckedCreateInputObjectSchema]) }).strict();