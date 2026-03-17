import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { NullableJsonNullValueInputSchema } from '../enums/NullableJsonNullValueInput.schema';
import { DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema as DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema } from './DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInput.schema'

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
  delegations: z.lazy(() => DelegationDetailUncheckedCreateNestedManyWithoutPrivilegeInputObjectSchema).optional()
}).strict();
export const PrivilegeUncheckedCreateWithoutRolesInputObjectSchema: z.ZodType<Prisma.PrivilegeUncheckedCreateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeUncheckedCreateWithoutRolesInput>;
export const PrivilegeUncheckedCreateWithoutRolesInputObjectZodSchema = makeSchema();
