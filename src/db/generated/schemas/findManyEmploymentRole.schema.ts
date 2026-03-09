import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { EmploymentRoleIncludeObjectSchema as EmploymentRoleIncludeObjectSchema } from './objects/EmploymentRoleInclude.schema';
import { EmploymentRoleOrderByWithRelationInputObjectSchema as EmploymentRoleOrderByWithRelationInputObjectSchema } from './objects/EmploymentRoleOrderByWithRelationInput.schema';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleScalarFieldEnumSchema } from './enums/EmploymentRoleScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const EmploymentRoleFindManySelectSchema: z.ZodType<Prisma.EmploymentRoleSelect> = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleSelect>;

export const EmploymentRoleFindManySelectZodSchema = z.object({
    employmentId: z.boolean().optional(),
    roleId: z.boolean().optional(),
    employment: z.boolean().optional(),
    role: z.boolean().optional()
  }).strict();

export const EmploymentRoleFindManySchema: z.ZodType<Prisma.EmploymentRoleFindManyArgs> = z.object({ select: EmploymentRoleFindManySelectSchema.optional(), include: z.lazy(() => EmploymentRoleIncludeObjectSchema.optional()), orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleFindManyArgs>;

export const EmploymentRoleFindManyZodSchema = z.object({ select: EmploymentRoleFindManySelectSchema.optional(), include: z.lazy(() => EmploymentRoleIncludeObjectSchema.optional()), orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentRoleScalarFieldEnumSchema, EmploymentRoleScalarFieldEnumSchema.array()]).optional() }).strict();