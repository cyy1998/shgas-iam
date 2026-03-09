import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PositionRoleUncheckedUpdateManyWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedUpdateManyWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedUpdateManyWithoutPositionInput>;
export const PositionRoleUncheckedUpdateManyWithoutPositionInputObjectZodSchema = makeSchema();
