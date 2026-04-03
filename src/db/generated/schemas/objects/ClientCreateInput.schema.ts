import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { JsonNullValueInputSchema } from '../enums/JsonNullValueInput.schema';
import { RoleCreateNestedManyWithoutClientInputObjectSchema as RoleCreateNestedManyWithoutClientInputObjectSchema } from './RoleCreateNestedManyWithoutClientInput.schema'

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
  extAttributes: z.union([JsonNullValueInputSchema, jsonSchema]),
  roles: z.lazy(() => RoleCreateNestedManyWithoutClientInputObjectSchema).optional()
}).strict();
export const ClientCreateInputObjectSchema: z.ZodType<Prisma.ClientCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.ClientCreateInput>;
export const ClientCreateInputObjectZodSchema = makeSchema();
