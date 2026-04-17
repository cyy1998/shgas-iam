import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PrivilegeDelegationOrderByRelevanceFieldEnumSchema } from '../enums/PrivilegeDelegationOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([PrivilegeDelegationOrderByRelevanceFieldEnumSchema, PrivilegeDelegationOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const PrivilegeDelegationOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationOrderByRelevanceInput>;
export const PrivilegeDelegationOrderByRelevanceInputObjectZodSchema = makeSchema();
