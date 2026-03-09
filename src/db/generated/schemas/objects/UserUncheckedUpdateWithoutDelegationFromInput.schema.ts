import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { EmploymentUncheckedUpdateManyWithoutUserNestedInputObjectSchema as EmploymentUncheckedUpdateManyWithoutUserNestedInputObjectSchema } from './EmploymentUncheckedUpdateManyWithoutUserNestedInput.schema';
import { PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInputObjectSchema as PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInputObjectSchema } from './PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  username: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  wxId: z.union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  name: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  password: z.union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  mobile: z.union([z.string(), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  userType: z.union([z.string(), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  orderNum: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  employments: z.lazy(() => EmploymentUncheckedUpdateManyWithoutUserNestedInputObjectSchema).optional(),
  delegationTo: z.lazy(() => PrivilegeDelegationUncheckedUpdateManyWithoutDelegatorUserNestedInputObjectSchema).optional()
}).strict();
export const UserUncheckedUpdateWithoutDelegationFromInputObjectSchema: z.ZodType<Prisma.UserUncheckedUpdateWithoutDelegationFromInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUncheckedUpdateWithoutDelegationFromInput>;
export const UserUncheckedUpdateWithoutDelegationFromInputObjectZodSchema = makeSchema();
