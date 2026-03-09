import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './objects/PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionUpdateInputObjectSchema as PosOrgCompositionUpdateInputObjectSchema } from './objects/PosOrgCompositionUpdateInput.schema';
import { PosOrgCompositionUncheckedUpdateInputObjectSchema as PosOrgCompositionUncheckedUpdateInputObjectSchema } from './objects/PosOrgCompositionUncheckedUpdateInput.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionUpdateOneSchema: z.ZodType<Prisma.PosOrgCompositionUpdateArgs> = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), data: z.union([PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema]), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateArgs>;

export const PosOrgCompositionUpdateOneZodSchema = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), data: z.union([PosOrgCompositionUpdateInputObjectSchema, PosOrgCompositionUncheckedUpdateInputObjectSchema]), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();