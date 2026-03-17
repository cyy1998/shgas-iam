import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleIncludeObjectSchema as RoleIncludeObjectSchema } from './objects/RoleInclude.schema';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './objects/RoleOrderByWithRelationInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './objects/RoleWhereInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';
import { RoleScalarFieldEnumSchema } from './enums/RoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const RoleFindManySelectSchema: z.ZodType<Prisma.RoleSelect> = z.object({
    id: z.boolean().optional(),
    roleCode: z.boolean().optional(),
    roleName: z.boolean().optional(),
    clientId: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    client: z.boolean().optional(),
    positions: z.boolean().optional(),
    organizations: z.boolean().optional(),
    positionOrganizations: z.boolean().optional(),
    employments: z.boolean().optional(),
    privileges: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.RoleSelect>;

export const RoleFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    roleCode: z.boolean().optional(),
    roleName: z.boolean().optional(),
    clientId: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    client: z.boolean().optional(),
    positions: z.boolean().optional(),
    organizations: z.boolean().optional(),
    positionOrganizations: z.boolean().optional(),
    employments: z.boolean().optional(),
    privileges: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const RoleFindManySchema: z.ZodType<Prisma.RoleFindManyArgs> = z.object({ select: RoleFindManySelectSchema.optional(), include: z.lazy(() => RoleIncludeObjectSchema.optional()), orderBy: z.union([RoleOrderByWithRelationInputObjectSchema, RoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: RoleWhereInputObjectSchema.optional(), cursor: RoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([RoleScalarFieldEnumSchema, RoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.RoleFindManyArgs>;

export const RoleFindManyZodSchema = z.object({ select: RoleFindManySelectSchema.optional(), include: z.lazy(() => RoleIncludeObjectSchema.optional()), orderBy: z.union([RoleOrderByWithRelationInputObjectSchema, RoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: RoleWhereInputObjectSchema.optional(), cursor: RoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([RoleScalarFieldEnumSchema, RoleScalarFieldEnumSchema.array()]).optional() }).strict();