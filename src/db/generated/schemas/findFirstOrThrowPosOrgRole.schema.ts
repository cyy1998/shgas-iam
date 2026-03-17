import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PosOrgRoleIncludeObjectSchema as PosOrgRoleIncludeObjectSchema } from './objects/PosOrgRoleInclude.schema';
import { PosOrgRoleOrderByWithRelationInputObjectSchema as PosOrgRoleOrderByWithRelationInputObjectSchema } from './objects/PosOrgRoleOrderByWithRelationInput.schema';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './objects/PosOrgRoleWhereInput.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleScalarFieldEnumSchema } from './enums/PosOrgRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PosOrgRoleFindFirstOrThrowSelectSchema: z.ZodType<Prisma.PosOrgRoleSelect> = z.object({
    posOrgId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleSelect>;

export const PosOrgRoleFindFirstOrThrowSelectZodSchema = z.object({
    posOrgId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const PosOrgRoleFindFirstOrThrowSchema: z.ZodType<Prisma.PosOrgRoleFindFirstOrThrowArgs> = z.object({ select: PosOrgRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => PosOrgRoleIncludeObjectSchema.optional()), orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgRoleScalarFieldEnumSchema, PosOrgRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleFindFirstOrThrowArgs>;

export const PosOrgRoleFindFirstOrThrowZodSchema = z.object({ select: PosOrgRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => PosOrgRoleIncludeObjectSchema.optional()), orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgRoleScalarFieldEnumSchema, PosOrgRoleScalarFieldEnumSchema.array()]).optional() }).strict();