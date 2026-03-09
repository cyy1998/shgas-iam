import type { Prisma } from '../prisma/client';
import { z } from '@hono/zod-openapi';
import { PosOrgCompositionSelectObjectSchema as PosOrgCompositionSelectObjectSchema } from './objects/PosOrgCompositionSelect.schema';
import { PosOrgCompositionIncludeObjectSchema as PosOrgCompositionIncludeObjectSchema } from './objects/PosOrgCompositionInclude.schema';
import { PosOrgCompositionWhereUniqueInputObjectSchema as PosOrgCompositionWhereUniqueInputObjectSchema } from './objects/PosOrgCompositionWhereUniqueInput.schema';

export const PosOrgCompositionFindUniqueSchema: z.ZodType<Prisma.PosOrgCompositionFindUniqueArgs> = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict() as unknown as z.ZodType<Prisma.PosOrgCompositionFindUniqueArgs>;

export const PosOrgCompositionFindUniqueZodSchema = z.object({ select: PosOrgCompositionSelectObjectSchema.optional(), include: PosOrgCompositionIncludeObjectSchema.optional(), where: PosOrgCompositionWhereUniqueInputObjectSchema }).strict();