import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationRoleOrderByWithRelationInputObjectSchema as OrganizationRoleOrderByWithRelationInputObjectSchema } from './objects/OrganizationRoleOrderByWithRelationInput.schema';
import { OrganizationRoleWhereInputObjectSchema as OrganizationRoleWhereInputObjectSchema } from './objects/OrganizationRoleWhereInput.schema';
import { OrganizationRoleWhereUniqueInputObjectSchema as OrganizationRoleWhereUniqueInputObjectSchema } from './objects/OrganizationRoleWhereUniqueInput.schema';
import { OrganizationRoleScalarFieldEnumSchema } from './enums/OrganizationRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const OrganizationRoleFindFirstSelectSchema: z.ZodType<Prisma.OrganizationRoleSelect> = z.object({
    organizationId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    isAllSub: z.boolean().optional(),
    organization: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleSelect>;

export const OrganizationRoleFindFirstSelectZodSchema = z.object({
    organizationId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    isAllSub: z.boolean().optional(),
    organization: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const OrganizationRoleFindFirstSchema: z.ZodType<Prisma.OrganizationRoleFindFirstArgs> = z.object({ select: OrganizationRoleFindFirstSelectSchema.optional(),  orderBy: z.union([OrganizationRoleOrderByWithRelationInputObjectSchema, OrganizationRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationRoleWhereInputObjectSchema.optional(), cursor: OrganizationRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationRoleScalarFieldEnumSchema, OrganizationRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationRoleFindFirstArgs>;

export const OrganizationRoleFindFirstZodSchema = z.object({ select: OrganizationRoleFindFirstSelectSchema.optional(),  orderBy: z.union([OrganizationRoleOrderByWithRelationInputObjectSchema, OrganizationRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationRoleWhereInputObjectSchema.optional(), cursor: OrganizationRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationRoleScalarFieldEnumSchema, OrganizationRoleScalarFieldEnumSchema.array()]).optional() }).strict();