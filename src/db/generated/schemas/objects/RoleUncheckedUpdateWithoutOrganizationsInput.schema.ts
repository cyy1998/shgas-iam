import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { PositionRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema as PositionRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema } from './PositionRoleUncheckedUpdateManyWithoutRoleNestedInput.schema';
import { PosOrgRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema as PosOrgRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema } from './PosOrgRoleUncheckedUpdateManyWithoutRoleNestedInput.schema';
import { EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema as EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema } from './EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInput.schema';
import { RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInputObjectSchema as RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInputObjectSchema } from './RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  roleCode: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  roleName: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  clientId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  positions: z.lazy(() => PositionRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleUncheckedUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeUncheckedUpdateManyWithoutRoleNestedInputObjectSchema).optional()
}).strict();
export const RoleUncheckedUpdateWithoutOrganizationsInputObjectSchema: z.ZodType<Prisma.RoleUncheckedUpdateWithoutOrganizationsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUncheckedUpdateWithoutOrganizationsInput>;
export const RoleUncheckedUpdateWithoutOrganizationsInputObjectZodSchema = makeSchema();
