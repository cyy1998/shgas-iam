import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  delegationId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateManyInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateManyInput>;
export const DelegationDetailUncheckedUpdateManyInputObjectZodSchema = makeSchema();
