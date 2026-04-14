import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleOrderByWithRelationInputObjectSchema as EmploymentRoleOrderByWithRelationInputObjectSchema } from './objects/EmploymentRoleOrderByWithRelationInput.schema';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleScalarFieldEnumSchema } from './enums/EmploymentRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const EmploymentRoleFindFirstSelectSchema: z.ZodType<Prisma.EmploymentRoleSelect> = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleSelect>;

export const EmploymentRoleFindFirstSelectZodSchema = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const EmploymentRoleFindFirstSchema: z.ZodType<Prisma.EmploymentRoleFindFirstArgs> = z.object({ select: EmploymentRoleFindFirstSelectSchema.optional(),  orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleFindFirstArgs>;

export const EmploymentRoleFindFirstZodSchema = z.object({ select: EmploymentRoleFindFirstSelectSchema.optional(),  orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict();