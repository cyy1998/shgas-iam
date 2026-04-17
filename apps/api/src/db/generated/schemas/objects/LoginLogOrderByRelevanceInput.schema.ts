import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { LoginLogOrderByRelevanceFieldEnumSchema } from '../enums/LoginLogOrderByRelevanceFieldEnum.schema';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  fields: z.union([LoginLogOrderByRelevanceFieldEnumSchema, LoginLogOrderByRelevanceFieldEnumSchema.array()]),
  sort: SortOrderSchema,
  search: z.string()
}).strict();
export const LoginLogOrderByRelevanceInputObjectSchema: z.ZodType<Prisma.LoginLogOrderByRelevanceInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogOrderByRelevanceInput>;
export const LoginLogOrderByRelevanceInputObjectZodSchema = makeSchema();
