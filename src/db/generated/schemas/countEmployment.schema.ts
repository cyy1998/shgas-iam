import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentOrderByWithRelationInputObjectSchema as EmploymentOrderByWithRelationInputObjectSchema } from './objects/EmploymentOrderByWithRelationInput.schema';
import { EmploymentWhereInputObjectSchema as EmploymentWhereInputObjectSchema } from './objects/EmploymentWhereInput.schema';
import { EmploymentWhereUniqueInputObjectSchema as EmploymentWhereUniqueInputObjectSchema } from './objects/EmploymentWhereUniqueInput.schema';
import { EmploymentCountAggregateInputObjectSchema as EmploymentCountAggregateInputObjectSchema } from './objects/EmploymentCountAggregateInput.schema';

export const EmploymentCountSchema: z.ZodType<Prisma.EmploymentCountArgs> = z.object({ orderBy: z.union([EmploymentOrderByWithRelationInputObjectSchema, EmploymentOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentWhereInputObjectSchema.optional(), cursor: EmploymentWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), EmploymentCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentCountArgs>;

export const EmploymentCountZodSchema = z.object({ orderBy: z.union([EmploymentOrderByWithRelationInputObjectSchema, EmploymentOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentWhereInputObjectSchema.optional(), cursor: EmploymentWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), EmploymentCountAggregateInputObjectSchema ]).optional() }).strict();