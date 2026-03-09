import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  organizationId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationRoleUncheckedUpdateManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUncheckedUpdateManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUncheckedUpdateManyWithoutRoleInput>;
export const OrganizationRoleUncheckedUpdateManyWithoutRoleInputObjectZodSchema = makeSchema();
