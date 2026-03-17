import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema';
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
  updateTime: z.coerce.date().optional(),
  delegations: z.lazy(() => DelegationDetailCreateNestedManyWithoutPrivilegeInputObjectSchema).optional()
}).strict();
export const PrivilegeCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeCreateWithoutRolesInput>;
export const PrivilegeCreateWithoutRolesInputObjectZodSchema = makeSchema();
