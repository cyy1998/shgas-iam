import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgRoleOrderByWithRelationInputObjectSchema as PosOrgRoleOrderByWithRelationInputObjectSchema } from './objects/PosOrgRoleOrderByWithRelationInput.schema';
import { PosOrgRoleWhereInputObjectSchema as PosOrgRoleWhereInputObjectSchema } from './objects/PosOrgRoleWhereInput.schema';
import { PosOrgRoleWhereUniqueInputObjectSchema as PosOrgRoleWhereUniqueInputObjectSchema } from './objects/PosOrgRoleWhereUniqueInput.schema';
import { PosOrgRoleCountAggregateInputObjectSchema as PosOrgRoleCountAggregateInputObjectSchema } from './objects/PosOrgRoleCountAggregateInput.schema';

export const PosOrgRoleCountSchema: z.ZodType<Prisma.PosOrgRoleCountArgs> = z.object({ orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PosOrgRoleCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.PosOrgRoleCountArgs>;

export const PosOrgRoleCountZodSchema = z.object({ orderBy: z.union([PosOrgRoleOrderByWithRelationInputObjectSchema, PosOrgRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: PosOrgRoleWhereInputObjectSchema.optional(), cursor: PosOrgRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PosOrgRoleCountAggregateInputObjectSchema ]).optional() }).strict();