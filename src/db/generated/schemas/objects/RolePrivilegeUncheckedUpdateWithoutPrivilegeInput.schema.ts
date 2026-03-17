import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.RolePrivilegeUncheckedUpdateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.RolePrivilegeUncheckedUpdateWithoutPrivilegeInput>;
export const RolePrivilegeUncheckedUpdateWithoutPrivilegeInputObjectZodSchema = makeSchema();
