import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionIncludeObjectSchema as PositionIncludeObjectSchema } from './objects/PositionInclude.schema';
import { PositionOrderByWithRelationInputObjectSchema as PositionOrderByWithRelationInputObjectSchema } from './objects/PositionOrderByWithRelationInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './objects/PositionWhereInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';
import { PositionScalarFieldEnumSchema } from './enums/PositionScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const PositionFindFirstSelectSchema: z.ZodType<Prisma.PositionSelect> = z.object({
    id: z.boolean().optional(),
    posCode: z.boolean().optional(),
    posName: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    employments: z.boolean().optional(),
    roles: z.boolean().optional(),
    posOrgComposition: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.PositionSelect>;

export const PositionFindFirstSelectZodSchema = z.object({
    id: z.boolean().optional(),
    posCode: z.boolean().optional(),
    posName: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    employments: z.boolean().optional(),
    roles: z.boolean().optional(),
    posOrgComposition: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const PositionFindFirstSchema: z.ZodType<Prisma.PositionFindFirstArgs> = z.object({ select: PositionFindFirstSelectSchema.optional(), include: z.lazy(() => PositionIncludeObjectSchema.optional()), orderBy: z.union([PositionOrderByWithRelationInputObjectSchema, PositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionWhereInputObjectSchema.optional(), cursor: PositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PositionScalarFieldEnumSchema, PositionScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.PositionFindFirstArgs>;

export const PositionFindFirstZodSchema = z.object({ select: PositionFindFirstSelectSchema.optional(), include: z.lazy(() => PositionIncludeObjectSchema.optional()), orderBy: z.union([PositionOrderByWithRelationInputObjectSchema, PositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionWhereInputObjectSchema.optional(), cursor: PositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([PositionScalarFieldEnumSchema, PositionScalarFieldEnumSchema.array()]).optional() }).strict();