import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { EmploymentOrderByRelevanceFieldEnumSchema } from '../enums/EmploymentOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([EmploymentOrderByRelevanceFieldEnumSchema, EmploymentOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const EmploymentOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.EmploymentOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentOrderByRelevanceInput>;
export const EmploymentOrderByRelevanceInputObjectZodSchema = makeSchema();
