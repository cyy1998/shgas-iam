import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionOrderByRelevanceFieldEnumSchema } from '../enums/PositionOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([PositionOrderByRelevanceFieldEnumSchema, PositionOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const PositionOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.PositionOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionOrderByRelevanceInput>;
export const PositionOrderByRelevanceInputObjectZodSchema = makeSchema();
