import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { LoginLogOrderByWithRelationInputObjectSchema as LoginLogOrderByWithRelationInputObjectSchema } from './objects/LoginLogOrderByWithRelationInput.schema';
import { LoginLogWhereInputObjectSchema as LoginLogWhereInputObjectSchema } from './objects/LoginLogWhereInput.schema';
import { LoginLogWhereUniqueInputObjectSchema as LoginLogWhereUniqueInputObjectSchema } from './objects/LoginLogWhereUniqueInput.schema';
import { LoginLogCountAggregateInputObjectSchema as LoginLogCountAggregateInputObjectSchema } from './objects/LoginLogCountAggregateInput.schema';

export const LoginLogCountSchema: z.ZodType<Prisma.LoginLogCountArgs> = z.object({ orderBy: z.union([LoginLogOrderByWithRelationInputObjectSchema, LoginLogOrderByWithRelationInputObjectSchema.array()]).optional(), where: LoginLogWhereInputObjectSchema.optional(), cursor: LoginLogWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), LoginLogCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.LoginLogCountArgs>;

export const LoginLogCountZodSchema = z.object({ orderBy: z.union([LoginLogOrderByWithRelationInputObjectSchema, LoginLogOrderByWithRelationInputObjectSchema.array()]).optional(), where: LoginLogWhereInputObjectSchema.optional(), cursor: LoginLogWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), LoginLogCountAggregateInputObjectSchema ]).optional() }).strict();