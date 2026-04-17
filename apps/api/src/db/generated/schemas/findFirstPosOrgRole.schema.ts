import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleOrderByWithRelationInputObjectSchema as PosOrgRoleOrderByWithRelationInputObjectSchema } from './objects/PosOrgRoleOrderByWithRelationInput.schema';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './objects/PosOrgRoleWhereInput.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleScalarFieldEnumSchema } from './enums/PosOrgRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PosOrgRoleFindFirstSelectSchema: z.ZodType<Prisma.PosOrgRoleSelect> = z.object({
    posOrgId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleSelect>;

export const PosOrgRoleFindFirstSelectZodSchema = z.object({
    posOrgId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const PosOrgRoleFindFirstSchema: z.ZodType<Prisma.PosOrgRoleFindFirstArgs> = z.object({ select: PosOrgRoleFindFirstSelectSchema.optional(),  orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgRoleScalarFieldEnumSchema, PosOrgRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleFindFirstArgs>;

export const PosOrgRoleFindFirstZodSchema = z.object({ select: PosOrgRoleFindFirstSelectSchema.optional(),  orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgRoleScalarFieldEnumSchema, PosOrgRoleScalarFieldEnumSchema.array()]).optional() }).strict();