import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { PositionOrderByWithRelationInputObjectSchema as PositionOrderByWithRelationInputObjectSchema } from './objects/PositionOrderByWithRelationInput.schema';
import { PositionWhereInputObjectSchema as PositionWhereInputObjectSchema } from './objects/PositionWhereInput.schema';
import { PositionWhereUniqueInputObjectSchema as PositionWhereUniqueInputObjectSchema } from './objects/PositionWhereUniqueInput.schema';
import { PositionCountAggregateInputObjectSchema as PositionCountAggregateInputObjectSchema } from './objects/PositionCountAggregateInput.schema';

export const PositionCountSchema: z.ZodType<Prisma.PositionCountArgs> = z.object({ orderBy: z.union([PositionOrderByWithRelationInputObjectSchema, PositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionWhereInputObjectSchema.optional(), cursor: PositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PositionCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.PositionCountArgs>;

export const PositionCountZodSchema = z.object({ orderBy: z.union([PositionOrderByWithRelationInputObjectSchema, PositionOrderByWithRelationInputObjectSchema.array()]).optional(), where: PositionWhereInputObjectSchema.optional(), cursor: PositionWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PositionCountAggregateInputObjectSchema ]).optional() }).strict();