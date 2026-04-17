import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { OrganizationOrderByRelevanceFieldEnumSchema } from '../enums/OrganizationOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([OrganizationOrderByRelevanceFieldEnumSchema, OrganizationOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const OrganizationOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.OrganizationOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationOrderByRelevanceInput>;
export const OrganizationOrderByRelevanceInputObjectZodSchema = makeSchema();
