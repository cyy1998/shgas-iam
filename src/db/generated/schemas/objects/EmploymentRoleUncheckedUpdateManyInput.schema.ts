import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  employmentId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  roleId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const EmploymentRoleUncheckedUpdateManyInputObjectSchema: z.ZodType<Prisma.EmploymentRoleUncheckedUpdateManyInput> = makeSchema() as unknown as z.ZodType<Prisma.EmploymentRoleUncheckedUpdateManyInput>;
export const EmploymentRoleUncheckedUpdateManyInputObjectZodSchema = makeSchema();
