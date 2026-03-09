import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionOrderByWithRelationInputObjectSchema as PosOrgCompositionOrderByWithRelationInputObjectSchema } from './objects/PosOrgCompositionOrderByWithRelationInput.schema';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './objects/PosOrgCompositionWhereInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionScalarFieldEnumSchema } from './enums/PosOrgCompositionScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PosOrgCompositionFindManySelectSchema: z.ZodType<Prisma.PosOrgCompositionSelect> = z.object({
    id: z.boolean().optional(),
    posId: z.boolean().optional(),
    orgId: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    position: z.boolean().optional(),
    organization: z.boolean().optional(),
    employments: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionSelect>;

export const PosOrgCompositionFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    posId: z.boolean().optional(),
    orgId: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    position: z.boolean().optional(),
    organization: z.boolean().optional(),
    employments: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const PosOrgCompositionFindManySchema: z.ZodType<Prisma.PosOrgCompositionFindManyArgs> = z.object({ select: PosOrgCompositionFindManySelectSchema.optional(), include: z.lazy(() => PosOrgCompositionIncludeObjectSchema.optional()), orderBy: z.union([PosOrgCompositionOrderByWithRelationInputObjectSchema, PosOrgCompositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgCompositionWhereInputObjectSchema.optional(), cursor: PosOrgCompositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgCompositionScalarFieldEnumSchema, PosOrgCompositionScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionFindManyArgs>;

export const PosOrgCompositionFindManyZodSchema = z.object({ select: PosOrgCompositionFindManySelectSchema.optional(), include: z.lazy(() => PosOrgCompositionIncludeObjectSchema.optional()), orderBy: z.union([PosOrgCompositionOrderByWithRelationInputObjectSchema, PosOrgCompositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgCompositionWhereInputObjectSchema.optional(), cursor: PosOrgCompositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PosOrgCompositionScalarFieldEnumSchema, PosOrgCompositionScalarFieldEnumSchema.array()]).optional() }).strict();