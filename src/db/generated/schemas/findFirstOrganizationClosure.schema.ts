import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './objects/OrganizationClosureInclude.schema';
import { OrganizationClosureOrderByWithRelationInputObjectSchema as OrganizationClosureOrderByWithRelationInputObjectSchema } from './objects/OrganizationClosureOrderByWithRelationInput.schema';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './objects/OrganizationClosureWhereInput.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureScalarFieldEnumSchema } from './enums/OrganizationClosureScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const OrganizationClosureFindFirstSelectSchema: z.ZodType<Prisma.OrganizationClosureSelect> = z.object({
    id: z.boolean().optional(),
    ancestorId: z.boolean().optional(),
    descendantId: z.boolean().optional(),
    depth: z.boolean().optional(),
    ancestor: z.boolean().optional(),
    descendant: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureSelect>;

export const OrganizationClosureFindFirstSelectZodSchema = z.object({
    id: z.boolean().optional(),
    ancestorId: z.boolean().optional(),
    descendantId: z.boolean().optional(),
    depth: z.boolean().optional(),
    ancestor: z.boolean().optional(),
    descendant: z.boolean().optional()
  }).strict();

export const OrganizationClosureFindFirstSchema: z.ZodType<Prisma.OrganizationClosureFindFirstArgs> = z.object({ select: OrganizationClosureFindFirstSelectSchema.optional(), include: z.lazy(() => OrganizationClosureIncludeObjectSchema.optional()), orderBy: z.union([OrganizationClosureOrderByWithRelationInputObjectSchema, OrganizationClosureOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationClosureWhereInputObjectSchema.optional(), cursor: OrganizationClosureWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationClosureScalarFieldEnumSchema, OrganizationClosureScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureFindFirstArgs>;

export const OrganizationClosureFindFirstZodSchema = z.object({ select: OrganizationClosureFindFirstSelectSchema.optional(), include: z.lazy(() => OrganizationClosureIncludeObjectSchema.optional()), orderBy: z.union([OrganizationClosureOrderByWithRelationInputObjectSchema, OrganizationClosureOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationClosureWhereInputObjectSchema.optional(), cursor: OrganizationClosureWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationClosureScalarFieldEnumSchema, OrganizationClosureScalarFieldEnumSchema.array()]).optional() }).strict();