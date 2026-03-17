import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionWhereInputObjectSchema as PosOrgCompositionWhereInputObjectSchema } from './PosOrgCompositionWhereInput.schema'

const makeSchema = () => z.object({
  every: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional(),
  some: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional(),
  none: z.lazy(() => PosOrgCompositionWhereInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionListRelationFilterObjectSchema: z.ZodType<Prisma.PosOrgCompositionListRelationFilter> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionListRelationFilter>;
export const PosOrgCompositionListRelationFilterObjectZodSchema = makeSchema();
