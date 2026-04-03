import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { JsonNullValueInputSchema } from '../enums/JsonNullValueInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  clientCode: z.string().max(64),
  clientName: z.string().max(128),
  clientSecret: z.string().max(255),
  url: z.string().max(128).optional().nullable(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  extAttributes: z.union([JsonNullValueInputSchema, jsonSchema])
}).strict();
export const ClientCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.ClientCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientCreateWithoutRolesInput>;
export const ClientCreateWithoutRolesInputObjectZodSchema = makeSchema();
