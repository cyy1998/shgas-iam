import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleOrderByWithRelationInputObjectSchema as EmploymentRoleOrderByWithRelationInputObjectSchema } from './objects/EmploymentRoleOrderByWithRelationInput.schema';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleScalarFieldEnumSchema } from './enums/EmploymentRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const EmploymentRoleFindFirstOrThrowSelectSchema: z.ZodType<Prisma.EmploymentRoleSelect> = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleSelect>;

export const EmploymentRoleFindFirstOrThrowSelectZodSchema = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const EmploymentRoleFindFirstOrThrowSchema: z.ZodType<Prisma.EmploymentRoleFindFirstOrThrowArgs> = z.object({ select: EmploymentRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => EmploymentRoleIncludeObjectSchema.optional()), orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleFindFirstOrThrowArgs>;

export const EmploymentRoleFindFirstOrThrowZodSchema = z.object({ select: EmploymentRoleFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => EmploymentRoleIncludeObjectSchema.optional()), orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict();