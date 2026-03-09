import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { NullableDateTimeFieldUpdateOperationsInputObjectSchema as NullableDateTimeFieldUpdateOperationsInputObjectSchema } from './NullableDateTimeFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { UserUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema as UserUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema } from './UserUpdateOneRequiredWithoutEmploymentsNestedInput.schema';
import { OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInput.schema';
import { OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInput.schema';
import { PositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema as PositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema } from './PositionUpdateOneRequiredWithoutEmploymentsNestedInput.schema';
import { PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema as PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema } from './PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInput.schema'

const makeSchema = () => z.object({
  isPrimary: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  startTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  endTime: z.union([z.coerce.date(), z.lazy(() => NullableDateTimeFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  user: z.lazy(() => UserUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema).optional(),
  deptartment: z.lazy(() => OrganizationUpdateOneRequiredWithoutDeptEmploymentsNestedInputObjectSchema).optional(),
  company: z.lazy(() => OrganizationUpdateOneRequiredWithoutCompEmploymentsNestedInputObjectSchema).optional(),
  position: z.lazy(() => PositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema).optional(),
  posOrg: z.lazy(() => PosOrgCompositionUpdateOneRequiredWithoutEmploymentsNestedInputObjectSchema).optional()
}).strict();
export const EmploymentUpdateWithoutRolesInputObjectSchema: z.ZodType<Prisma.EmploymentUpdateWithoutRolesInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentUpdateWithoutRolesInput>;
export const EmploymentUpdateWithoutRolesInputObjectZodSchema = makeSchema();
