import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RoleWhereInputObjectSchema as RoleWhereInputObjectSchema } from './objects/RoleWhereInput.schema';
import { RoleOrderByWithAggregationInputObjectSchema as RoleOrderByWithAggregationInputObjectSchema } from './objects/RoleOrderByWithAggregationInput.schema';
import { RoleScalarWhereWithAggregatesInputObjectSchema as RoleScalarWhereWithAggregatesInputObjectSchema } from './objects/RoleScalarWhereWithAggregatesInput.schema';
import { RoleScalarFieldEnumSchema } from './enums/RoleScalarFieldEnum.schema';
import { RoleCountAggregateInputObjectSchema as RoleCountAggregateInputObjectSchema } from './objects/RoleCountAggregateInput.schema';
import { RoleMinAggregateInputObjectSchema as RoleMinAggregateInputObjectSchema } from './objects/RoleMinAggregateInput.schema';
import { RoleMaxAggregateInputObjectSchema as RoleMaxAggregateInputObjectSchema } from './objects/RoleMaxAggregateInput.schema';
import { RoleAvgAggregateInputObjectSchema as RoleAvgAggregateInputObjectSchema } from './objects/RoleAvgAggregateInput.schema';
import { RoleSumAggregateInputObjectSchema as RoleSumAggregateInputObjectSchema } from './objects/RoleSumAggregateInput.schema';

export const RoleGroupBySchema: z.ZodType<Prisma.RoleGroupByArgs> = z.object({ where: RoleWhereInputObjectSchema.optional(), orderBy: z.union([RoleOrderByWithAggregationInputObjectSchema, RoleOrderByWithAggregationInputObjectSchema.array()]).optional(), having: RoleScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(RoleScalarFieldEnumSchema), _count: z.union([ z.literal(true), RoleCountAggregateInputObjectSchema ]).optional(), _min: RoleMinAggregateInputObjectSchema.optional(), _max: RoleMaxAggregateInputObjectSchema.optional(), _avg: RoleAvgAggregateInputObjectSchema.optional(), _sum: RoleSumAggregateInputObjectSchema.optional() }).strict() as unknown as z.ZodType<Prisma.RoleGroupByArgs>;

export const RoleGroupByZodSchema = z.object({ where: RoleWhereInputObjectSchema.optional(), orderBy: z.union([RoleOrderByWithAggregationInputObjectSchema, RoleOrderByWithAggregationInputObjectSchema.array()]).optional(), having: RoleScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(RoleScalarFieldEnumSchema), _count: z.union([ z.literal(true), RoleCountAggregateInputObjectSchema ]).optional(), _min: RoleMinAggregateInputObjectSchema.optional(), _max: RoleMaxAggregateInputObjectSchema.optional(), _avg: RoleAvgAggregateInputObjectSchema.optional(), _sum: RoleSumAggregateInputObjectSchema.optional() }).strict();