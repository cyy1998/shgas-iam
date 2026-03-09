import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestorId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedUpdateWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedUpdateWithoutDescendantInput>;
export const OrganizationClosureUncheckedUpdateWithoutDescendantInputObjectZodSchema = makeSchema();
