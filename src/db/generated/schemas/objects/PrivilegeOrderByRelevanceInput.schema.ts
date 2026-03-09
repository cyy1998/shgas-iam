import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PrivilegeOrderByRelevanceFieldEnumSchema } from '../enums/PrivilegeOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([PrivilegeOrderByRelevanceFieldEnumSchema, PrivilegeOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const PrivilegeOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.PrivilegeOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeOrderByRelevanceInput>;
export const PrivilegeOrderByRelevanceInputObjectZodSchema = makeSchema();
