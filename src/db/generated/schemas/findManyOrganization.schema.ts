import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationOrderByWithRelationInputObjectSchema as OrganizationOrderByWithRelationInputObjectSchema } from './objects/OrganizationOrderByWithRelationInput.schema';
import { OrganizationWhereInputObjectSchema as OrganizationWhereInputObjectSchema } from './objects/OrganizationWhereInput.schema';
import { OrganizationWhereUniqueInputObjectSchema as OrganizationWhereUniqueInputObjectSchema } from './objects/OrganizationWhereUniqueInput.schema';
import { OrganizationScalarFieldEnumSchema } from './enums/OrganizationScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const OrganizationFindManySelectSchema: z.ZodType<Prisma.OrganizationSelect> = z.object({
    id: z.boolean().optional(),
    orgCode: z.boolean().optional(),
    orgName: z.boolean().optional(),
    parentId: z.boolean().optional(),
    businessParentId: z.boolean().optional(),
    path: z.boolean().optional(),
    level: z.boolean().optional(),
    orgType: z.boolean().optional(),
    orderNum: z.boolean().optional(),
    isVirtual: z.boolean().optional(),
    isEntity: z.boolean().optional(),
    status: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    deptEmployments: z.boolean().optional(),
    compEmployments: z.boolean().optional(),
    roles: z.boolean().optional(),
    posOrgComposition: z.boolean().optional(),
    parent: z.boolean().optional(),
    children: z.boolean().optional(),
    ancestorClosures: z.boolean().optional(),
    descendantClosures: z.boolean().optional(),
    privilegeDelegations: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.OrganizationSelect>;

export const OrganizationFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    orgCode: z.boolean().optional(),
    orgName: z.boolean().optional(),
    parentId: z.boolean().optional(),
    businessParentId: z.boolean().optional(),
    path: z.boolean().optional(),
    level: z.boolean().optional(),
    orgType: z.boolean().optional(),
    orderNum: z.boolean().optional(),
    isVirtual: z.boolean().optional(),
    isEntity: z.boolean().optional(),
    status: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    deptEmployments: z.boolean().optional(),
    compEmployments: z.boolean().optional(),
    roles: z.boolean().optional(),
    posOrgComposition: z.boolean().optional(),
    parent: z.boolean().optional(),
    children: z.boolean().optional(),
    ancestorClosures: z.boolean().optional(),
    descendantClosures: z.boolean().optional(),
    privilegeDelegations: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const OrganizationFindManySchema: z.ZodType<Prisma.OrganizationFindManyArgs> = z.object({ select: OrganizationFindManySelectSchema.optional(),  orderBy: z.union([OrganizationOrderByWithRelationInputObjectSchema, OrganizationOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationWhereInputObjectSchema.optional(), cursor: OrganizationWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationScalarFieldEnumSchema, OrganizationScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationFindManyArgs>;

export const OrganizationFindManyZodSchema = z.object({ select: OrganizationFindManySelectSchema.optional(),  orderBy: z.union([OrganizationOrderByWithRelationInputObjectSchema, OrganizationOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationWhereInputObjectSchema.optional(), cursor: OrganizationWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationScalarFieldEnumSchema, OrganizationScalarFieldEnumSchema.array()]).optional() }).strict();