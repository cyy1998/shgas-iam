import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  employmentId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const EmploymentRoleUncheckedUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedUpdateWithoutRoleInput>;
export const EmploymentRoleUncheckedUpdateWithoutRoleInputObjectZodSchema = makeSchema();
