import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { RoleOrderByWithRelationInputObjectSchema as RoleOrderByWithRelationInputObjectSchema } from './objects/RoleOrderByWithRelationInput.schema';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './objects/RoleWhereInput.schema';
import { RoleWhereUniqueInputObjectSchema as RoleWhereUniqueInputObjectSchema } from './objects/RoleWhereUniqueInput.schema';
import { RoleCountAggregateInputObjectSchema as RoleCountAggregateInputObjectSchema } from './objects/RoleCountAggregateInput.schema';

export const RoleCountSchema: z.ZodType<Prisma.RoleCountArgs> = z.object({ orderBy: z.union([RoleOrderByWithRelationInputObjectSchema, RoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: RoleWhereInputObjectSchema.optional(), cursor: RoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), RoleCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.RoleCountArgs>;

export const RoleCountZodSchema = z.object({ orderBy: z.union([RoleOrderByWithRelationInputObjectSchema, RoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: RoleWhereInputObjectSchema.optional(), cursor: RoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), RoleCountAggregateInputObjectSchema ]).optional() }).strict();