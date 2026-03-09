import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInput.schema'

const makeSchema = () => z.object({
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestor: z.lazy(() => OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema).optional()
}).strict();
export const OrganizationClosureUpdateWithoutDescendantInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateWithoutDescendantInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateWithoutDescendantInput>;
export const OrganizationClosureUpdateWithoutDescendantInputObjectZodSchema = makeSchema();
