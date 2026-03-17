import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { RolePrivilegeOrderByWithRelationInputObjectSchema as RolePrivilegeOrderByWithRelationInputObjectSchema } from './objects/RolePrivilegeOrderByWithRelationInput.schema';
import { RolePrivilegeWhereInputObjectSchema as RolePrivilegeWhereInputObjectSchema } from './objects/RolePrivilegeWhereInput.schema';
import { RolePrivilegeWhereUniqueInputObjectSchema as RolePrivilegeWhereUniqueInputObjectSchema } from './objects/RolePrivilegeWhereUniqueInput.schema';
import { RolePrivilegeCountAggregateInputObjectSchema as RolePrivilegeCountAggregateInputObjectSchema } from './objects/RolePrivilegeCountAggregateInput.schema';

export const RolePrivilegeCountSchema: z.ZodType<Prisma.RolePrivilegeCountArgs> = z.object({ orderBy: z.union([RolePrivilegeOrderByWithRelationInputObjectSchema, RolePrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: RolePrivilegeWhereInputObjectSchema.optional(), cursor: RolePrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), RolePrivilegeCountAggregateInputObjectSchema ]).optional() }).strict() as unknown as z.ZodType<Prisma.RolePrivilegeCountArgs>;

export const RolePrivilegeCountZodSchema = z.object({ orderBy: z.union([RolePrivilegeOrderByWithRelationInputObjectSchema, RolePrivilegeOrderByWithRelationInputObjectSchema.array()]).optional(), where: RolePrivilegeWhereInputObjectSchema.optional(), cursor: RolePrivilegeWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), select: z.union([ z.literal(true), RolePrivilegeCountAggregateInputObjectSchema ]).optional() }).strict();