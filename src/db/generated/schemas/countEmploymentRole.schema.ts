import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { EmploymentRoleOrderByWithRelationInputObjectSchema as EmploymentRoleOrderByWithRelationInputObjectSchema } from './objects/EmploymentRoleOrderByWithRelationInput.schema';
import { EmploymentRoleWhereInputObjectSchema as EmploymentRoleWhereInputObjectSchema } from './objects/EmploymentRoleWhereInput.schema';
import { EmploymentRoleWhereUniqueInputObjectSchema as EmploymentRoleWhereUniqueInputObjectSchema } from './objects/EmploymentRoleWhereUniqueInput.schema';
import { EmploymentRoleCountAggregateInputObjectSchema as EmploymentRoleCountAggregateInputObjectSchema } from './objects/EmploymentRoleCountAggregateInput.schema';

export const EmploymentRoleCountSchema: z.ZodType<Prisma.EmploymentRoleCountArgs> = z.object({ orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), EmploymentRoleCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.EmploymentRoleCountArgs>;

export const EmploymentRoleCountZodSchema = z.object({ orderBy: z.union([EmploymentRoleOrderByWithRelationInputObjectSchema, EmploymentRoleOrderByWithRelationInputObjectSchema.array()]).optional(), where: EmploymentRoleWhereInputObjectSchema.optional(), cursor: EmploymentRoleWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), EmploymentRoleCountAggregateInputObjectSchema ]).optional() }).strict();