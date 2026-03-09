import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationRoleUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateManyMutationInput>;
export const OrganizationRoleUpdateManyMutationInputObjectZodSchema = makeSchema();
