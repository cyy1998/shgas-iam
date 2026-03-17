import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { ClientOrderByRelevanceFieldEnumSchema } from '../enums/ClientOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([ClientOrderByRelevanceFieldEnumSchema, ClientOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const ClientOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.ClientOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientOrderByRelevanceInput>;
export const ClientOrderByRelevanceInputObjectZodSchema = makeSchema();
