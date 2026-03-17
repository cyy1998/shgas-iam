import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema as PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema } from './PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInput.schema';
import { OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInput.schema';
import { EmploymentUpdateManyWithoutPosOrgNestedInputObjectSchema as EmploymentUpdateManyWithoutPosOrgNestedInputObjectSchema } from './EmploymentUpdateManyWithoutPosOrgNestedInput.schema';
import { PosOrgRoleUpdateManyWithoutPosOrgNestedInputObjectSchema as PosOrgRoleUpdateManyWithoutPosOrgNestedInputObjectSchema } from './PosOrgRoleUpdateManyWithoutPosOrgNestedInput.schema'

const makeSchema = () => z.object({
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  position: z.lazy(() => PositionUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema).optional(),
  organization: z.lazy(() => OrganizationUpdateOneRequiredWithoutPosOrgCompositionNestedInputObjectSchema).optional(),
  employments: z.lazy(() => EmploymentUpdateManyWithoutPosOrgNestedInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleUpdateManyWithoutPosOrgNestedInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUpdateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUpdateInput>;
export const PosOrgCompositionUpdateInputObjectZodSchema = makeSchema();
