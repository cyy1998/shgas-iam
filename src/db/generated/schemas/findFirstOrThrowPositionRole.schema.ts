import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionRoleIncludeObjectSchema as PositionRoleIncludeObjectSchema } from './objects/PositionRoleInclude.schema';
import { PositionRoleOrderByWithRelationInputObjectSchema as PositionRoleOrderByWithRelationInputObjectSchema } from './objects/PositionRoleOrderByWithRelationInput.schema';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './objects/PositionRoleWhereInput.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';
import { PositionRoleScalarFieldEnumSchema } from './enums/PositionRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PositionRoleFindFirstOrThrowSelectSchema: z.ZodType<Prisma.PositionRoleSelect> = z.object({
    positionId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    position: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PositionRoleSelect>;

export const PositionRoleFindFirstOrThrowSelectZodSchema = z.object({
    positionId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    position: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const PositionRoleFindFirstOrThrowSchema: z.ZodType<Prisma.PositionRoleFindFirstOrThrowArgs> = z.object({ select: PositionRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => PositionRoleIncludeObjectSchema.optional()), orderBy: z.union([PositionRoleOrderByWithRelationInputObjectSchema, PositionRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionRoleWhereInputObjectSchema.optional(), cursor: PositionRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PositionRoleScalarFieldEnumSchema, PositionRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PositionRoleFindFirstOrThrowArgs>;

export const PositionRoleFindFirstOrThrowZodSchema = z.object({ select: PositionRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => PositionRoleIncludeObjectSchema.optional()), orderBy: z.union([PositionRoleOrderByWithRelationInputObjectSchema, PositionRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionRoleWhereInputObjectSchema.optional(), cursor: PositionRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PositionRoleScalarFieldEnumSchema, PositionRoleScalarFieldEnumSchema.array()]).optional() }).strict();