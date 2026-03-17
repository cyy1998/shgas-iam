import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateManyWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyWithoutDelegationInput>;
export const DelegationDetailUncheckedUpdateManyWithoutDelegationInputObjectZodSchema = makeSchema();
