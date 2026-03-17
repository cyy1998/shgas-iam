import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  descendantId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedUpdateWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedUpdateWithoutAncestorInput>;
export const OrganizationClosureUncheckedUpdateWithoutAncestorInputObjectZodSchema = makeSchema();
