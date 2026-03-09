import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema'

const makeSchema = () => z.object({
  is: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional(),
  isNot: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionScalarRelationFilterObjectSchema: z.ZodType<Prisma.PosOrgCompositionScalarRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionScalarRelationFilter>;
export const PosOrgCompositionScalarRelationFilterObjectZodSchema = makeSchema();
