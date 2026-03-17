import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUncheckedUpdateManyWithoutPositionNestedInputObjectSchema as EmploymentUncheckedUpdateManyWithoutPositionNestedInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutPositionNestedInput.schema';
import { PositionRoleUncheckedUpdateManyWithoutPositionNestedInputObjectSchema as PositionRoleUncheckedUpdateManyWithoutPositionNestedInputObjectSchema } from './PositionRoleUncheckedUpdateManyWithoutPositionNestedInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  posCode: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  posName: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  employments: z.lazy(() => EmploymentUncheckedUpdateManyWithoutPositionNestedInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleUncheckedUpdateManyWithoutPositionNestedInputObjectSchema).optional()
}).strict();
export const PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionUncheckedUpdateWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUncheckedUpdateWithoutPosOrgCompositionInput>;
export const PositionUncheckedUpdateWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
