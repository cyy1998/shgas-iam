import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema as EmploymentUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutPosOrgNestedInput.schema';
import { PosOrgRoleUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema as PosOrgRoleUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema } from './PosOrgRoleUncheckedUpdateManyWithoutPosOrgNestedInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  posId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  orgId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  employments: z.lazy(() => EmploymentUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema).optional(),
  roles: z.lazy(() => PosOrgRoleUncheckedUpdateManyWithoutPosOrgNestedInputObjectSchema).optional()
}).strict();
export const PosOrgCompositionUncheckedUpdateInputObjectSchema: z.ZodType<Prisma.PosOrgCompositionUncheckedUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgCompositionUncheckedUpdateInput>;
export const PosOrgCompositionUncheckedUpdateInputObjectZodSchema = makeSchema();
