import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateWithoutDelegationInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateWithoutDelegationInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateWithoutDelegationInput>;
export const DelegationDetailUncheckedUpdateWithoutDelegationInputObjectZodSchema = makeSchema();
