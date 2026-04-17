import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeOrderByWithRelationInputObjectSchema as PrivilegeOrderByWithRelationInputObjectSchema } from './objects/PrivilegeOrderByWithRelationInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './objects/PrivilegeWhereInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';
import { PrivilegeScalarFieldEnumSchema } from './enums/PrivilegeScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PrivilegeFindFirstSelectSchema: z.ZodType<Prisma.PrivilegeSelect> = z.object({
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

export const PrivilegeFindFirstSelectZodSchema = z.object({
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

export const PrivilegeFindFirstSchema: z.ZodType<Prisma.PrivilegeFindFirstArgs> = z.object({ select: PrivilegeFindFirstSelectSchema.optional(),  orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeScalarFieldEnumSchema, PrivilegeScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeFindFirstArgs>;

export const PrivilegeFindFirstZodSchema = z.object({ select: PrivilegeFindFirstSelectSchema.optional(),  orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeScalarFieldEnumSchema, PrivilegeScalarFieldEnumSchema.array()]).optional() }).strict();