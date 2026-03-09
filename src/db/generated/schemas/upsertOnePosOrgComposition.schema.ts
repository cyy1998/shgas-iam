import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './objects/PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';
import { PosOrgCompositionCreateInputObjectSchema as PosOrgCompositionCreateInputObjectSchema } from './objects/PosOrgCompositionCreateInput.schema';
import { PosOrgCompositionUncheckedCreateInputObjectSchema as PosOrgCompositionUncheckedCreateInputObjectSchema } from './objects/PosOrgCompositionUncheckedCreateInput.schema';
import { PosOrgCompositionUpdateInputObjectSchema as PosOrgCompositionUpdateInputObjectSchema } from './objects/PosOrgCompositionUpdateInput.schema';
import { PosOrgCompositionUncheckedUpdateInputObjectSchema as PosOrgCompositionUncheckedUpdateInputObjectSchema } from './objects/PosOrgCompositionUncheckedUpdateInput.schema';

export const PosOrgCompositionUpsertOneSchema: z.ZodType<Prisma.PosOrgCompositionUpsertArgs> = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema, create: z.union([ PosOrgCompositionCreateInputObjectSchema, PosOrgCompositionUncheckedCreateInputObjectSchema ]), update: z.union([ PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema ]) }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionUpsertArgs>;

export const PosOrgCompositionUpsertOneZodSchema = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema, create: z.union([ PosOrgCompositionCreateInputObjectSchema, PosOrgCompositionUncheckedCreateInputObjectSchema ]), update: z.union([ PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema ]) }).strict();