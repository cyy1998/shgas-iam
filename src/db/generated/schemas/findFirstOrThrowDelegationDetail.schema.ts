import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailOrderByWithRelationInputObjectSchema as DelegationDetailOrderByWithRelationInputObjectSchema } from './objects/DelegationDetailOrderByWithRelationInput.schema';
import { DelegationDetailWhereInputObjectSchema as DelegationDetailWhereInputObjectSchema } from './objects/DelegationDetailWhereInput.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailScalarFieldEnumSchema } from './enums/DelegationDetailScalarFieldEnum.schema';

// Select schema needs to be in file to prevent circular imports
//------------------------------------------------------

export const DelegationDetailFindFirstOrThrowSelectSchema: z.ZodType<Prisma.DelegationDetailSelect> = z.object({
    delegationId: z.boolean().optional(),
    privilegeId: z.boolean().optional(),
    delegation: z.boolean().optional(),
    privilege: z.boolean().optional()
  }).strict() as unknown as z.ZodType<Prisma.DelegationDetailSelect>;

export const DelegationDetailFindFirstOrThrowSelectZodSchema = z.object({
    delegationId: z.boolean().optional(),
    privilegeId: z.boolean().optional(),
    delegation: z.boolean().optional(),
    privilege: z.boolean().optional()
  }).strict();

export const DelegationDetailFindFirstOrThrowSchema: z.ZodType<Prisma.DelegationDetailFindFirstOrThrowArgs> = z.object({ select: DelegationDetailFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => DelegationDetailIncludeObjectSchema.optional()), orderBy: z.union([DelegationDetailOrderByWithRelationInputObjectSchema, DelegationDetailOrderByWithRelationInputObjectSchema.array()]).optional(), where: DelegationDetailWhereInputObjectSchema.optional(), cursor: DelegationDetailWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([DelegationDetailScalarFieldEnumSchema, DelegationDetailScalarFieldEnumSchema.array()]).optional() }).strict() as unknown as z.ZodType<Prisma.DelegationDetailFindFirstOrThrowArgs>;

export const DelegationDetailFindFirstOrThrowZodSchema = z.object({ select: DelegationDetailFindFirstOrThrowSelectSchema.optional(), include: z.lazy(() => DelegationDetailIncludeObjectSchema.optional()), orderBy: z.union([DelegationDetailOrderByWithRelationInputObjectSchema, DelegationDetailOrderByWithRelationInputObjectSchema.array()]).optional(), where: DelegationDetailWhereInputObjectSchema.optional(), cursor: DelegationDetailWhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.union([DelegationDetailScalarFieldEnumSchema, DelegationDetailScalarFieldEnumSchema.array()]).optional() }).strict();