import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { JsonNullValueInputSchema } from '../enums/JsonNullValueInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  clientCode: z.string().max(64),
  clientName: z.string().max(128),
  url: z.string().max(128).optional().nullable(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  extAttributes: z.union([JsonNullValueInputSchema, jsonSchema])
}).strict();
export const ClientCreateManyInputObjectSchema: z.ZodType<Prisma.ClientCreateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientCreateManyInput>;
export const ClientCreateManyInputObjectZodSchema = makeSchema();
