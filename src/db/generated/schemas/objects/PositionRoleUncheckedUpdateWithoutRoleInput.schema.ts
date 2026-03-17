import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  positionId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PositionRoleUncheckedUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUncheckedUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUncheckedUpdateWithoutRoleInput>;
export const PositionRoleUncheckedUpdateWithoutRoleInputObjectZodSchema = makeSchema();
