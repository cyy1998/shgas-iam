import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { DateTimeFieldUpdateOperationsInputObjectSchema as DateTimeFieldUpdateOperationsInputObjectSchema } from './DateTimeFieldUpdateOperationsInput.schema';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { NullableStringFieldUpdateOperationsInputObjectSchema as NullableStringFieldUpdateOperationsInputObjectSchema } from './NullableStringFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { UserUpdateOneRequiredWithoutDelegationToNestedInputObjectSchema as UserUpdateOneRequiredWithoutDelegationToNestedInputObjectSchema } from './UserUpdateOneRequiredWithoutDelegationToNestedInput.schema';
import { OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInput.schema';
import { DelegationDetailUpdateManyWithoutDelegationNestedInputObjectSchema as DelegationDetailUpdateManyWithoutDelegationNestedInputObjectSchema } from './DelegationDetailUpdateManyWithoutDelegationNestedInput.schema'

const makeSchema = () => z.object({
  startTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  endTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  status: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  description: z.union([z.string().max(500), z.lazy(() => NullableStringFieldUpdateOperationsInputObjectSchema)]).optional().nullable(),
  isDelete: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  createTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  updateTime: z.union([z.coerce.date(), z.lazy(() => DateTimeFieldUpdateOperationsInputObjectSchema)]).optional(),
  delegatorUser: z.lazy(() => UserUpdateOneRequiredWithoutDelegationToNestedInputObjectSchema).optional(),
  organizationScope: z.lazy(() => OrganizationUpdateOneRequiredWithoutPrivilegeDelegationsNestedInputObjectSchema).optional(),
  delegationDetails: z.lazy(() => DelegationDetailUpdateManyWithoutDelegationNestedInputObjectSchema).optional()
}).strict();
export const PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectSchema: z.ZodType<Prisma.PrivilegeDelegationUpdateWithoutDelegateeUserInput> = makeSchema() as unknown as z.ZodType<Prisma.PrivilegeDelegationUpdateWithoutDelegateeUserInput>;
export const PrivilegeDelegationUpdateWithoutDelegateeUserInputObjectZodSchema = makeSchema();
