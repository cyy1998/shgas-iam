import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PrivilegeOrderByWithRelationInputObjectSchema as PrivilegeOrderByWithRelationInputObjectSchema } from './objects/PrivilegeOrderByWithRelationInput.schema';
import { PrivilegeWhereInputObjectSchema as PrivilegeWhereInputObjectSchema } from './objects/PrivilegeWhereInput.schema';
import { PrivilegeWhereUniqueInputObjectSchema as PrivilegeWhereUniqueInputObjectSchema } from './objects/PrivilegeWhereUniqueInput.schema';
import { PrivilegeCountAggregateInputObjectSchema as PrivilegeCountAggregateInputObjectSchema } from './objects/PrivilegeCountAggregateInput.schema';

export const PrivilegeCountSchema: z.ZodType<Prisma.PrivilegeCountArgs> = z.object({ orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PrivilegeCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.PrivilegeCountArgs>;

export const PrivilegeCountZodSchema = z.object({ orderBy: z.union([PrivilegeOrderByWithRelationInputObjectSchema, PrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: PrivilegeWhereInputObjectSchema.optional(), cursor: PrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), PrivilegeCountAggregateInputObjectSchema ]).optional() }).strict();