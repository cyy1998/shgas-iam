import type { Prisma } from '../prisma/client';
import * as z from 'zod';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './objects/DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';
import { DelegationDetailCreateInputObjectSchema as DelegationDetailCreateInputObjectSchema } from './objects/DelegationDetailCreateInput.schema';
import { DelegationDetailUncheckedCreateInputObjectSchema as DelegationDetailUncheckedCreateInputObjectSchema } from './objects/DelegationDetailUncheckedCreateInput.schema';
import { DelegationDetailUpdateInputObjectSchema as DelegationDetailUpdateInputObjectSchema } from './objects/DelegationDetailUpdateInput.schema';
import { DelegationDetailUncheckedUpdateInputObjectSchema as DelegationDetailUncheckedUpdateInputObjectSchema } from './objects/DelegationDetailUncheckedUpdateInput.schema';

export const DelegationDetailUpsertOneSchema: z.ZodType<Prisma.DelegationDetailUpsertArgs> = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema, create: z.union([ DelegationDetailCreateInputObjectSchema, DelegationDetailUncheckedCreateInputObjectSchema ]), update: z.union([ DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.DelegationDetailUpsertArgs>;

export const DelegationDetailUpsertOneZodSchema = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), where: DelegationDetailWhereUniqueInputObjectSchema, create: z.union([ DelegationDetailCreateInputObjectSchema, DelegationDetailUncheckedCreateInputObjectSchema ]), update: z.union([ DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema ]) }).strict();