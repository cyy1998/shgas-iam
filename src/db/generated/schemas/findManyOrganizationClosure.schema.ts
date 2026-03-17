import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { OrganizationClosureIncludeObjectSchema as OrganizationClosureIncludeObjectSchema } from './objects/OrganizationClosureInclude.schema';
import { OrganizationClosureOrderByWithRelationInputObjectSchema as OrganizationClosureOrderByWithRelationInputObjectSchema } from './objects/OrganizationClosureOrderByWithRelationInput.schema';
import { OrganizationClosureWhereInputObjectSchema as OrganizationClosureWhereInputObjectSchema } from './objects/OrganizationClosureWhereInput.schema';
import { OrganizationClosureWhereUniqueInputObjectSchema as OrganizationClosureWhereUniqueInputObjectSchema } from './objects/OrganizationClosureWhereUniqueInput.schema';
import { OrganizationClosureScalarFieldEnumSchema } from './enums/OrganizationClosureScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const OrganizationClosureFindManySelectSchema: z.ZodType<Prisma.OrganizationClosureSelect> = z.object({
    id: z.boolean().optional(),
    ancestorId: z.boolean().optional(),
    descendantId: z.boolean().optional(),
    depth: z.boolean().optional(),
    ancestor: z.boolean().optional(),
    descendant: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureSelect>;

export const OrganizationClosureFindManySelectZodSchema = z.object({
    id: z.boolean().optional(),
    ancestorId: z.boolean().optional(),
    descendantId: z.boolean().optional(),
    depth: z.boolean().optional(),
    ancestor: z.boolean().optional(),
    descendant: z.boolean().optional()
  }).strict();

export const OrganizationClosureFindManySchema: z.ZodType<Prisma.OrganizationClosureFindManyArgs> = z.object({ select: OrganizationClosureFindManySelectSchema.optional(), include: z.lazy(() => OrganizationClosureIncludeObjectSchema.optional()), orderBy: z.union([OrganizationClosureOrderByWithRelationInputObjectSchema, OrganizationClosureOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationClosureWhereInputObjectSchema.optional(), cursor: OrganizationClosureWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationClosureScalarFieldEnumSchema, OrganizationClosureScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.OrganizationClosureFindManyArgs>;

export const OrganizationClosureFindManyZodSchema = z.object({ select: OrganizationClosureFindManySelectSchema.optional(), include: z.lazy(() => OrganizationClosureIncludeObjectSchema.optional()), orderBy: z.union([OrganizationClosureOrderByWithRelationInputObjectSchema, OrganizationClosureOrderByWithRelationInputObjectSchema.array()]).optional(), where: OrganizationClosureWhereInputObjectSchema.optional(), cursor: OrganizationClosureWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([OrganizationClosureScalarFieldEnumSchema, OrganizationClosureScalarFieldEnumSchema.array()]).optional() }).strict();