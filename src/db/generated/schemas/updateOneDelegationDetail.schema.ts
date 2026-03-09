import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './objects/DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailUpdateInputObjectSchema as DelegationDetailUpdateInputObjectSchema } from './objects/DelegationDetailUpdateInput.schema';
import { DelegationDetailUncheckedUpdateInputObjectSchema as DelegationDetailUncheckedUpdateInputObjectSchema } from './objects/DelegationDetailUncheckedUpdateInput.schema';
import { DelegationDetailWhereUniqueInputObjectSchema as DelegationDetailWhereUniqueInputObjectSchema } from './objects/DelegationDetailWhereUniqueInput.schema';

export const DelegationDetailUpdateOneSchema: z.ZodType<Prisma.DelegationDetailUpdateArgs> = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), data: z.union([DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema]), where: DelegationDetailWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.DelegationDetailUpdateArgs>;

export const DelegationDetailUpdateOneZodSchema = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), data: z.union([DelegationDetailUpdateInputObjectSchema, DelegationDetailUncheckedUpdateInputObjectSchema]), where: DelegationDetailWhereUniqueInputObjectSchema }).strict();