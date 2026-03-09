import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInput.schema';
import { OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInput.schema'

const makeSchema = () => z.object({
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestor: z.lazy(() => OrganizationUpdateOneRequiredWithoutAncestorClosuresNestedInputObjectSchema).optional(),
  descendant: z.lazy(() => OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema).optional()
}).strict();
export const OrganizationClosureUpdateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateInput>;
export const OrganizationClosureUpdateInputObjectZodSchema = makeSchema();
