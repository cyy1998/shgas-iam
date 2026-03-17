import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { ClientOrderByWithRelationInputObjectSchema as ClientOrderByWithRelationInputObjectSchema } from './objects/ClientOrderByWithRelationInput.schema';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './objects/ClientWhereInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';
import { ClientCountAggregateInputObjectSchema as ClientCountAggregateInputObjectSchema } from './objects/ClientCountAggregateInput.schema';
import { ClientMinAggregateInputObjectSchema as ClientMinAggregateInputObjectSchema } from './objects/ClientMinAggregateInput.schema';
import { ClientMaxAggregateInputObjectSchema as ClientMaxAggregateInputObjectSchema } from './objects/ClientMaxAggregateInput.schema';
import { ClientAvgAggregateInputObjectSchema as ClientAvgAggregateInputObjectSchema } from './objects/ClientAvgAggregateInput.schema';
import { ClientSumAggregateInputObjectSchema as ClientSumAggregateInputObjectSchema } from './objects/ClientSumAggregateInput.schema';

export const ClientAggregateSchema: z.ZodType<Prisma.ClientAggregateArgs> = z.object({ orderBy: z.union([ClientOrderByWithRelationInputObjectSchema, ClientOrderByWithRelationInputObjectSchema.array()]).optional(), where: ClientWhereInputObjectSchema.optional(), cursor: ClientWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), _count: z.union([ z.literal(true), ClientCountAggregateInputObjectSchema ]).optional(), _min: ClientMinAggregateInputObjectSchema.optional(), _max: ClientMaxAggregateInputObjectSchema.optional(), _avg: ClientAvgAggregateInputObjectSchema.optional(), _sum: ClientSumAggregateInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.ClientAggregateArgs>;

export const ClientAggregateZodSchema = z.object({ orderBy: z.union([ClientOrderByWithRelationInputObjectSchema, ClientOrderByWithRelationInputObjectSchema.array()]).optional(), where: ClientWhereInputObjectSchema.optional(), cursor: ClientWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), _count: z.union([ z.literal(true), ClientCountAggregateInputObjectSchema ]).optional(), _min: ClientMinAggregateInputObjectSchema.optional(), _max: ClientMaxAggregateInputObjectSchema.optional(), _avg: ClientAvgAggregateInputObjectSchema.optional(), _sum: ClientSumAggregateInputObjectSchema.optional() }).strict();