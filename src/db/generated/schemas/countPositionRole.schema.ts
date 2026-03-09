import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PositionRoleOrderByWithRelationInputObjectSchema as PositionRoleOrderByWithRelationInputObjectSchema } from './objects/PositionRoleOrderByWithRelationInput.schema';
import { PositionRoleWhereInputObjectSchema as PositionRoleWhereInputObjectSchema } from './objects/PositionRoleWhereInput.schema';
import { PositionRoleWhereUniqueInputObjectSchema as PositionRoleWhereUniqueInputObjectSchema } from './objects/PositionRoleWhereUniqueInput.schema';
import { PositionRoleCountAggregateInputObjectSchema as PositionRoleCountAggregateInputObjectSchema } from './objects/PositionRoleCountAggregateInput.schema';

export const PositionRoleCountSchema: z.ZodType<Prisma.PositionRoleCountArgs> = z.object({ orderBy: z.union([PositionRoleOrderByWithRelationInputObjectSchema, PositionRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionRoleWhereInputObjectSchema.optional(), cursor: PositionRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PositionRoleCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.PositionRoleCountArgs>;

export const PositionRoleCountZodSchema = z.object({ orderBy: z.union([PositionRoleOrderByWithRelationInputObjectSchema, PositionRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionRoleWhereInputObjectSchema.optional(), cursor: PositionRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PositionRoleCountAggregateInputObjectSchema ]).optional() }).strict();