import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionOrderByRelevanceFieldEnumSchema } from '../enums/PosOrgCompositionOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([PosOrgCompositionOrderByRelevanceFieldEnumSchema, PosOrgCompositionOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const PosOrgCompositionOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionOrderByRelevanceInput>;
export const PosOrgCompositionOrderByRelevanceInputObjectZodSchema = makeSchema();
