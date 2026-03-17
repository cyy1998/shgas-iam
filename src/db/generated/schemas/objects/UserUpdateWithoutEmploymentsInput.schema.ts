import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { StringFieldUpdateOperationsInputObjectSchema as StringFieldUpdateOperationsInputObjectSchema } from './StringFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInputObjectSchema as PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInputObjectSchema } from './PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInput.schema';
import { PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInputObjectSchema as PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInputObjectSchema } from './PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInput.schema'

const makeSchema = () => z.object({
  username: z.union([z.string().max(64), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  wxId: z.union([z.string().max(255), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  name: z.union([z.string().max(64), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  password: z.union([z.string().max(255), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  mobile: z.union([z.string().max(20), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  userType: z.union([z.string().max(20), z.lazy(() => StringFieldUpdateOperationsInputObjectSchema)]).optional(),
  orderNum: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  delegationTo: z.lazy(() => PrivilegeDelegationUpdateManyWithoutDelegatorUserNestedInputObjectSchema).optional(),
  delegationFrom: z.lazy(() => PrivilegeDelegationUpdateManyWithoutDelegateeUserNestedInputObjectSchema).optional()
}).strict();
export const UserUpdateWithoutEmploymentsInputObjectSchema: z.ZodType<Prisma.UserUpdateWithoutEmploymentsInput> = makeSchema() as unknown as z.ZodType<Prisma.UserUpdateWithoutEmploymentsInput>;
export const UserUpdateWithoutEmploymentsInputObjectZodSchema = makeSchema();
