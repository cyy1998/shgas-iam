import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentIncludeObjectSchema as EmploymentIncludeObjectSchema } from './objects/EmploymentInclude.schema';
import { EmploymentOrderByWithRelationInputObjectSchema as EmploymentOrderByWithRelationInputObjectSchema } from './objects/EmploymentOrderByWithRelationInput.schema';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './objects/EmploymentWhereInput.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';
import { EmploymentScalarFieldEnumSchema } from './enums/EmploymentScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const EmploymentFindManySelectSchema: z.ZodType<Prisma.EmploymentSelect> = z.object({
    id: z.boolean().optional(),
    userId: z.boolean().optional(),
    posId: z.boolean().optional(),
    orgId: z.boolean().optional(),
    compId: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    status: z.boolean().optional(),
    startTime: z.boolean().optional(),
    endTime: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    user: z.boolean().optional(),
    deptartment: z.boolean().optional(),
    company: z.boolean().optional(),
    position: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.EmploymentSelect>;

export const EmploymentFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    userId: z.boolean().optional(),
    posId: z.boolean().optional(),
    orgId: z.boolean().optional(),
    compId: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    status: z.boolean().optional(),
    startTime: z.boolean().optional(),
    endTime: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    user: z.boolean().optional(),
    deptartment: z.boolean().optional(),
    company: z.boolean().optional(),
    position: z.boolean().optional(),
    posOrg: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const EmploymentFindManySchema: z.ZodType<Prisma.EmploymentFindManyArgs> = z.object({ select: EmploymentFindManySelectSchema.optional(), include: z.lazy(() => EmploymentIncludeObjectSchema.optional()), orderBy: z.union([EmploymentOrderByWithRelationInputObjectSchema, EmploymentOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentWhereInputObjectSchema.optional(), cursor: EmploymentWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentScalarFieldEnumSchema, EmploymentScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentFindManyArgs>;

export const EmploymentFindManyZodSchema = z.object({ select: EmploymentFindManySelectSchema.optional(), include: z.lazy(() => EmploymentIncludeObjectSchema.optional()), orderBy: z.union([EmploymentOrderByWithRelationInputObjectSchema, EmploymentOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentWhereInputObjectSchema.optional(), cursor: EmploymentWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([EmploymentScalarFieldEnumSchema, EmploymentScalarFieldEnumSchema.array()]).optional() }).strict();