import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInput.schema'

const makeSchema = () => z.object({
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  descendant: z.lazy(() => OrganizationUpdateOneRequiredWithoutDescendantClosuresNestedInputObjectSchema).optional()
}).strict();
export const OrganizationClosureUpdateWithoutAncestorInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateWithoutAncestorInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateWithoutAncestorInput>;
export const OrganizationClosureUpdateWithoutAncestorInputObjectZodSchema = makeSchema();
