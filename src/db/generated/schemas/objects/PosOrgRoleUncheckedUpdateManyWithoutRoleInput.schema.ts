import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  posOrgId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PosOrgRoleUncheckedUpdateManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedUpdateManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedUpdateManyWithoutRoleInput>;
export const PosOrgRoleUncheckedUpdateManyWithoutRoleInputObjectZodSchema = makeSchema();
