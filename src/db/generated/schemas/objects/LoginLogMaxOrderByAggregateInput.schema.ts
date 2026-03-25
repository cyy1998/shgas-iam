import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { SortOrderSchema } from '../enums/SortOrder.schema'

const makeSchema = () => z.object({
  id: SortOrderSchema.optional(),
  userId: SortOrderSchema.optional(),
  username: SortOrderSchema.optional(),
  name: SortOrderSchema.optional(),
  clientCode: SortOrderSchema.optional(),
  loginType: SortOrderSchema.optional(),
  loginTime: SortOrderSchema.optional()
}).strict();
export const LoginLogMaxOrderByAggregateInputObjectSchema: z.ZodType<Prisma.LoginLogMaxOrderByAggregateInput> = makeSchema() as unknown as z.ZodType<Prisma.LoginLogMaxOrderByAggregateInput>;
export const LoginLogMaxOrderByAggregateInputObjectZodSchema = makeSchema();
