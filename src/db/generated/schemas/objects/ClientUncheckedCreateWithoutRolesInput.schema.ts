import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { JsonNullValueInputSchema } from '../enums/JsonNullValueInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  clientCode: z.string(),
  clientName: z.string(),
  url: z.string().optional().nullable(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  extAttributes: z.union([JsonNullValueInputSchema, jsonSchema])
}).strict();
export const ClientUncheckedCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientUncheckedCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientUncheckedCreateWithoutRolesInput>;
export const ClientUncheckedCreateWithoutRolesInputObjectZodSchema = makeSchema();
