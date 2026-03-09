import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  employmentId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const EmploymentRoleUncheckedUpdateManyWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedUpdateManyWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedUpdateManyWithoutRoleInput>;
export const EmploymentRoleUncheckedUpdateManyWithoutRoleInputObjectZodSchema = makeSchema();
