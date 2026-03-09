import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { ClientUpdateOneRequiredWithoutRolesNestedInputObjectSchema as ClientUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './ClientUpdateOneRequiredWithoutRolesNestedInput.schema';
import { OrganizationRoleUpdateManyWithoutRoleNestedInputObjectSchema as OrganizationRoleUpdateManyWithoutRoleNestedInputObjectSchema } from './OrganizationRoleUpdateManyWithoutRoleNestedInput.schema';
import { PosOrgRoleUpdateManyWithoutRoleNestedInputObjectSchema as PosOrgRoleUpdateManyWithoutRoleNestedInputObjectSchema } from './PosOrgRoleUpdateManyWithoutRoleNestedInput.schema';
import { EmploymentRoleUpdateManyWithoutRoleNestedInputObjectSchema as EmploymentRoleUpdateManyWithoutRoleNestedInputObjectSchema } from './EmploymentRoleUpdateManyWithoutRoleNestedInput.schema';
import { RolePrivilegeUpdateManyWithoutRoleNestedInputObjectSchema as RolePrivilegeUpdateManyWithoutRoleNestedInputObjectSchema } from './RolePrivilegeUpdateManyWithoutRoleNestedInput.schema'

const makeSchema = () => z.object({
  roleCode: z.union([z.string().max(64), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  roleName: z.union([z.string().max(128), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  client: z.lazy(() => ClientUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional(),
  organizations: z.lazy(() => OrganizationRoleUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  positionOrganizations: z.lazy(() => PosOrgRoleUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentRoleUpdateManyWithoutRoleNestedInputObjectSchema).optional(),
  privileges: z.lazy(() => RolePrivilegeUpdateManyWithoutRoleNestedInputObjectSchema).optional()
}).strict();
export const RoleUpdateWithoutPositionsInputObjectSchema: z.ZodType<Prisma.RoleUpdateWithoutPositionsInput> = makeSchema() as unknown as z.ZodType<Prisma.RoleUpdateWithoutPositionsInput>;
export const RoleUpdateWithoutPositionsInputObjectZodSchema = makeSchema();
