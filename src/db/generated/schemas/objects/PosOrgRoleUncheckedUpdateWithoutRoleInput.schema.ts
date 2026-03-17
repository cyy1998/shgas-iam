import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  posOrgId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PosOrgRoleUncheckedUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedUpdateWithoutRoleInput>;
export const PosOrgRoleUncheckedUpdateWithoutRoleInputObjectZodSchema = makeSchema();
