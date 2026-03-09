import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  id: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestorId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  descendantId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationClosureUncheckedUpdateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUncheckedUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUncheckedUpdateInput>;
export const OrganizationClosureUncheckedUpdateInputObjectZodSchema = makeSchema();
