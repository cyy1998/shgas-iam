import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  privilegeCode: z.string(),
  privilegeName: z.string(),
  fieldValues: z.union([NullableJsonNullValueInputSchema, jsonSchema]).optional(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional()
}).strict();
export const PrivilegeCreateManyInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateManyInput>;
export const PrivilegeCreateManyInputObjectZodSchema = makeSchema();
