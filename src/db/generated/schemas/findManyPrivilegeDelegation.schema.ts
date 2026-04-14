import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PrivilegeDelegationOrderByWithRelationInputObjectSchema as PrivilegeDelegationOrderByWithRelationInputObjectSchema } from './objects/PrivilegeDelegationOrderByWithRelationInput.schema';
import { PrivilegeDelegationWhereInputObjectSchema as PrivilegeDelegationWhereInputObjectSchema } from './objects/PrivilegeDelegationWhereInput.schema';
import { PrivilegeDelegationWhereUniqueInputObjectSchema as PrivilegeDelegationWhereUniqueInputObjectSchema } from './objects/PrivilegeDelegationWhereUniqueInput.schema';
import { PrivilegeDelegationScalarFieldEnumSchema } from './enums/PrivilegeDelegationScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PrivilegeDelegationFindManySelectSchema: z.ZodType<Prisma.PrivilegeDelegationSelect> = z.object({
    id: z.boolean().optional(),
    delegatorUserId: z.boolean().optional(),
    delegateeUserId: z.boolean().optional(),
    organizationScopeId: z.boolean().optional(),
    startTime: z.boolean().optional(),
    endTime: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    delegatorUser: z.boolean().optional(),
    delegateeUser: z.boolean().optional(),
    organizationScope: z.boolean().optional(),
    delegationDetails: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationSelect>;

export const PrivilegeDelegationFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    delegatorUserId: z.boolean().optional(),
    delegateeUserId: z.boolean().optional(),
    organizationScopeId: z.boolean().optional(),
    startTime: z.boolean().optional(),
    endTime: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    delegatorUser: z.boolean().optional(),
    delegateeUser: z.boolean().optional(),
    organizationScope: z.boolean().optional(),
    delegationDetails: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const PrivilegeDelegationFindManySchema: z.ZodType<Prisma.PrivilegeDelegationFindManyArgs> = z.object({ select: PrivilegeDelegationFindManySelectSchema.optional(),  orderBy: z.union([PrivilegeDelegationOrderByWithRelationInputObjectSchema, PrivilegeDelegationOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeDelegationWhereInputObjectSchema.optional(), cursor: PrivilegeDelegationWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeDelegationScalarFieldEnumSchema, PrivilegeDelegationScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeDelegationFindManyArgs>;

export const PrivilegeDelegationFindManyZodSchema = z.object({ select: PrivilegeDelegationFindManySelectSchema.optional(),  orderBy: z.union([PrivilegeDelegationOrderByWithRelationInputObjectSchema, PrivilegeDelegationOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeDelegationWhereInputObjectSchema.optional(), cursor: PrivilegeDelegationWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PrivilegeDelegationScalarFieldEnumSchema, PrivilegeDelegationScalarFieldEnumSchema.array()]).optional() }).strict();