import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  delegationId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateInput>;
export const DelegationDetailUncheckedUpdateInputObjectZodSchema = makeSchema();
