import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedUpdateWithoutEmploymentInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedUpdateWithoutEmploymentInput>;
export const EmploymentRoleUncheckedUpdateWithoutEmploymentInputObjectZodSchema = makeSchema();
