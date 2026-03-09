import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleOrderByRelevanceFieldEnumSchema } from '../enums/RoleOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([RoleOrderByRelevanceFieldEnumSchema, RoleOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const RoleOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.RoleOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleOrderByRelevanceInput>;
export const RoleOrderByRelevanceInputObjectZodSchema = makeSchema();
