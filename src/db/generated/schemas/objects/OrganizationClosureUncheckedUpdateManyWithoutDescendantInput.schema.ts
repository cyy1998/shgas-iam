import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestorId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationClosureUncheckedUpdateManyWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedUpdateManyWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedUpdateManyWithoutDescendantInput>;
export const OrganizationClosureUncheckedUpdateManyWithoutDescendantInputObjectZodSchema = makeSchema();
