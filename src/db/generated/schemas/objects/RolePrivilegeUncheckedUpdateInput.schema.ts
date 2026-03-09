import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const RolePrivilegeUncheckedUpdateInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedUpdateInput>;
export const RolePrivilegeUncheckedUpdateInputObjectZodSchema = makeSchema();
