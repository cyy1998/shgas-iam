import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeSelectObjectSchema as RolePrivilegeSelectObjectSchema } from './objects/RolePrivilegeSelect.schema';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './objects/RolePrivilegeInclude.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';

export const RolePrivilegeDeleteOneSchema: z.ZodType<Prisma.RolePrivilegeDeleteArgs> = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeDeleteArgs>;

export const RolePrivilegeDeleteOneZodSchema = z.object({ select: RolePrivilegeSelectObjectSchema.optional(), include: RolePrivilegeIncludeObjectSchema.optional(), where: RolePrivilegeWhereUniqueInputObjectSchema }).strict();