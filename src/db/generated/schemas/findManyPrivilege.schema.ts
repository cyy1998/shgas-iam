import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeIncludeObjectSchema as PrivilegeIncludeObjectSchema } from './objects/PrivilegeInclude.schema';
import { PrivilegeOrderByWithRelationInputObjectSchema as PrivilegeOrderByWithRelationInputObjectSchema } from './objects/PrivilegeOrderByWithRelationInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './objects/PrivilegeWhereInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';
import { PrivilegeScalarFieldEnumSchema } from './enums/PrivilegeScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PrivilegeFindManySelectSchema: z.ZodType<Prisma.PrivilegeSelect> = z.object({
    id: z.boolean().optional(),
    privilegeCode: z.boolean().optional(),
    privilegeName: z.boolean().optional(),
    fieldValues: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    roles: z.boolean().optional(),
    delegations: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PrivilegeSelect>;

export const PrivilegeFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    privilegeCode: z.boolean().optional(),
    privilegeName: z.boolean().optional(),
    fieldValues: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    roles: z.boolean().optional(),
    delegations: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const PrivilegeFindManySchema: z.ZodType<Prisma.PrivilegeFindManyArgs> = z.object({ select: PrivilegeFindManySelectSchema.optional(), include: z.lazy(() => PrivilegeIncludeObjectSchema.optional()), orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeScalarFieldEnumSchema, PrivilegeScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeFindManyArgs>;

export const PrivilegeFindManyZodSchema = z.object({ select: PrivilegeFindManySelectSchema.optional(), include: z.lazy(() => PrivilegeIncludeObjectSchema.optional()), orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeScalarFieldEnumSchema, PrivilegeScalarFieldEnumSchema.array()]).optional() }).strict();