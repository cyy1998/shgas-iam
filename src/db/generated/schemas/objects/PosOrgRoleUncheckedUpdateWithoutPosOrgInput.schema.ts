import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUncheckedUpdateWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUncheckedUpdateWithoutPosOrgInput>;
export const PosOrgRoleUncheckedUpdateWithoutPosOrgInputObjectZodSchema = makeSchema();
