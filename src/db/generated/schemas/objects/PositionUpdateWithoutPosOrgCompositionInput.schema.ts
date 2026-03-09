import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUpdateManyWithoutPositionNestedInputObjectSchema as EmploymentUpdateManyWithoutPositionNestedInputObjectSchema } from './EmploymentUpdateManyWithoutPositionNestedInput.schema';
import { PositionRoleUpdateManyWithoutPositionNestedInputObjectSchema as PositionRoleUpdateManyWithoutPositionNestedInputObjectSchema } from './PositionRoleUpdateManyWithoutPositionNestedInput.schema'

const makeSchema = () => z.object({
  posCode: z.union([z.string().max(64), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  posName: z.union([z.string().max(128), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  employments: z.lazy(() => EmploymentUpdateManyWithoutPositionNestedInputObjectSchema).optional(),
  roles: z.lazy(() => PositionRoleUpdateManyWithoutPositionNestedInputObjectSchema).optional()
}).strict();
export const PositionUpdateWithoutPosOrgCompositionInputObjectSchema: z.ZodType<Prisma.PositionUpdateWithoutPosOrgCompositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionUpdateWithoutPosOrgCompositionInput>;
export const PositionUpdateWithoutPosOrgCompositionInputObjectZodSchema = makeSchema();
