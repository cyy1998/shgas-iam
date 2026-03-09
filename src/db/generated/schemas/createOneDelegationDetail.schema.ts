import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { DelegationDetailSelectObjectSchema as DelegationDetailSelectObjectSchema } from './objects/DelegationDetailSelect.schema';
import { DelegationDetailIncludeObjectSchema as DelegationDetailIncludeObjectSchema } from './objects/DelegationDetailInclude.schema';
import { DelegationDetailCreateInputObjectSchema as DelegationDetailCreateInputObjectSchema } from './objects/DelegationDetailCreateInput.schema';
import { DelegationDetailUncheckedCreateInputObjectSchema as DelegationDetailUncheckedCreateInputObjectSchema } from './objects/DelegationDetailUncheckedCreateInput.schema';

export const DelegationDetailCreateOneSchema: z.ZodType<Prisma.DelegationDetailCreateArgs> = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), data: z.union([DelegationDetailCreateInputObjectSchema, DelegationDetailUncheckedCreateInputObjectSchema]) }).strict() as unknown as z.ZodType<Prisma.DelegationDetailCreateArgs>;

export const DelegationDetailCreateOneZodSchema = z.object({ select: DelegationDetailSelectObjectSchema.optional(), include: DelegationDetailIncludeObjectSchema.optional(), data: z.union([DelegationDetailCreateInputObjectSchema, DelegationDetailUncheckedCreateInputObjectSchema]) }).strict();