import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  positionId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PositionRoleUncheckedUpdateInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedUpdateInput>;
export const PositionRoleUncheckedUpdateInputObjectZodSchema = makeSchema();
