import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema';
import { RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema as RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema } from './RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  id: z.number().int().optional(),
  privilegeCode: z.string(),
  privilegeName: z.string(),
  fieldValues: z.union([NullableJsonNullValueInputSchema, jsonSchema]).optional(),
  status: z.number().int().optional(),
  description: z.string().optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  updateTime: z.coerce.date().optional(),
  roles: z.lazy(() => RolePrivilegeUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema).optional()
}).strict();
export const PrivilegeUncheckedCreateWithoutDelegationsInputObjectSchema: z.ZodType<Prisma.PrivilegeUncheckedCreateWithoutDelegationsInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUncheckedCreateWithoutDelegationsInput>;
export const PrivilegeUncheckedCreateWithoutDelegationsInputObjectZodSchema = makeSchema();
