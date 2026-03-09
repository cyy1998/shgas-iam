import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { ClientIncludeObjectSchema as ClientIncludeObjectSchema } from './objects/ClientInclude.schema';
import { ClientOrderByWithRelationInputObjectSchema as ClientOrderByWithRelationInputObjectSchema } from './objects/ClientOrderByWithRelationInput.schema';
import { ClientWhereInputObjectSchema as ClientWhereInputObjectSchema } from './objects/ClientWhereInput.schema';
import { ClientWhereUniqueInputObjectSchema as ClientWhereUniqueInputObjectSchema } from './objects/ClientWhereUniqueInput.schema';
import { ClientScalarFieldEnumSchema } from './enums/ClientScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const ClientFindFirstSelectSchema: z.ZodType<Prisma.ClientSelect> = z.object({
    id: z.boolean().optional(),
    clientCode: z.boolean().optional(),
    clientName: z.boolean().optional(),
    url: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    extAttributes: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.ClientSelect>;

export const ClientFindFirstSelectZodSchema = z.object({
    id: z.boolean().optional(),
    clientCode: z.boolean().optional(),
    clientName: z.boolean().optional(),
    url: z.boolean().optional(),
    status: z.boolean().optional(),
    description: z.boolean().optional(),
    isDelete: z.boolean().optional(),
    createTime: z.boolean().optional(),
    updateTime: z.boolean().optional(),
    extAttributes: z.boolean().optional(),
    roles: z.boolean().optional(),
    _count: z.boolean().optional()
  }).strict();

export const ClientFindFirstSchema: z.ZodType<Prisma.ClientFindFirstArgs> = z.object({ select: ClientFindFirstSelectSchema.optional(), include: z.lazy(() => ClientIncludeObjectSchema.optional()), orderBy: z.union([ClientOrderByWithRelationInputObjectSchema, ClientOrderByWithRelationInputObjectSchema.array()]).optional(), where: ClientWhereInputObjectSchema.optional(), cursor: ClientWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([ClientScalarFieldEnumSchema, ClientScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.ClientFindFirstArgs>;

export const ClientFindFirstZodSchema = z.object({ select: ClientFindFirstSelectSchema.optional(), include: z.lazy(() => ClientIncludeObjectSchema.optional()), orderBy: z.union([ClientOrderByWithRelationInputObjectSchema, ClientOrderByWithRelationInputObjectSchema.array()]).optional(), where: ClientWhereInputObjectSchema.optional(), cursor: ClientWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([ClientScalarFieldEnumSchema, ClientScalarFieldEnumSchema.array()]).optional() }).strict();