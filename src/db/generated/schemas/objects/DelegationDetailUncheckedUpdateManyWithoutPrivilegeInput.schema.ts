import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  delegationId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateManyWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutPrivilegeInput>;
export const DelegationDetailUncheckedUpdateManyWithoutPrivilegeInputObjectZodSchema = makeSchema();
