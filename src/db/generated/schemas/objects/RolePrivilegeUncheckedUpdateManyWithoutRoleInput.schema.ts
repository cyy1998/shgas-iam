import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  privilegeId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const RolePrivilegeUncheckedUpdateManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedUpdateManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedUpdateManyWithoutRoleInput>;
export const RolePrivilegeUncheckedUpdateManyWithoutRoleInputObjectZodSchema = makeSchema();
