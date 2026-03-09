import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema';
import { RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateNestedManyWithoutPrivilegeInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  privilegeCode: z.string(),
  privilegeName: z.string(),
  fieldValues: z.union([NullableJsonNullValueInputSchema, jsonSchema]).optional(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  roles: z.lazy(() => RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema).optional()
}).strict();
export const PrivilegeCreateWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateWithoutDelegationsInput>;
export const PrivilegeCreateWithoutDelegationsInputObjectZodSchema = makeSchema();
