import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema';
import { RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema as RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema } from './RolePrivilegeCreateNestedManyWithoutPrivilegeInput.schema';
import { DelegationDetailCreateNestedManyWithoutPrivilegeInputObjectSchema as DelegationDetailCreateNestedManyWithoutPrivilegeInputObjectSchema } from './DelegationDetailCreateNestedManyWithoutPrivilegeInput.schema'

import { JsonValueSchema as jsonSchema } from '../../helpers/json-helpers';

const makeSchema = () => z.object({
  privilegeCode: z.string(),
  privilegeName: z.string(),
  fieldValues: z.union([NullableJsonNullValueInputSchema, jsonSchema]).optional(),
  status: z.number().int().optional(),
  description: z.string().max(500).optional().nullable(),
  isDelete: z.boolean().optional(),
  createTime: z.coerce.date().optional(),
  roles: z.lazy(() => RolePrivilegeCreateNestedManyWithoutPrivilegeInputObjectSchema).optional(),
  delegations: z.lazy(() => DelegationDetailCreateNestedManyWithoutPrivilegeInputObjectSchema).optional()
}).strict();
export const PrivilegeCreateInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateInput>;
export const PrivilegeCreateInputObjectZodSchema = makeSchema();
