import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeIncludeObjectSchema as RolePrivilegeIncludeObjectSchema } from './objects/RolePrivilegeInclude.schema';
import { RolePrivilegeOrderByWithRelationInputObjectSchema as RolePrivilegeOrderByWithRelationInputObjectSchema } from './objects/RolePrivilegeOrderByWithRelationInput.schema';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './objects/RolePrivilegeWhereInput.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeScalarFieldEnumSchema } from './enums/RolePrivilegeScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const RolePrivilegeFindManySelectSchema: z.ZodType<Prisma.RolePrivilegeSelect> = z.object({
    roleId: z.boolean().optional(),
    privilegeId: z.boolean().optional(),
    role: z.boolean().optional(),
    privilege: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeSelect>;

export const RolePrivilegeFindManySelectZodSchema = z.object({
    roleId: z.boolean().optional(),
    privilegeId: z.boolean().optional(),
    role: z.boolean().optional(),
    privilege: z.boolean().optional()
  }).strict();

export const RolePrivilegeFindManySchema: z.ZodType<Prisma.RolePrivilegeFindManyArgs> = z.object({ select: RolePrivilegeFindManySelectSchema.optional(), include: z.lazy(() => RolePrivilegeIncludeObjectSchema.optional()), orderBy: z.union([RolePrivilegeOrderByWithRelationInputObjectSchema, RolePrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: RolePrivilegeWhereInputObjectSchema.optional(), cursor: RolePrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([RolePrivilegeScalarFieldEnumSchema, RolePrivilegeScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeFindManyArgs>;

export const RolePrivilegeFindManyZodSchema = z.object({ select: RolePrivilegeFindManySelectSchema.optional(), include: z.lazy(() => RolePrivilegeIncludeObjectSchema.optional()), orderBy: z.union([RolePrivilegeOrderByWithRelationInputObjectSchema, RolePrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: RolePrivilegeWhereInputObjectSchema.optional(), cursor: RolePrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([RolePrivilegeScalarFieldEnumSchema, RolePrivilegeScalarFieldEnumSchema.array()]).optional() }).strict();