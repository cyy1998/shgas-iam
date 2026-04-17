import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional(),
  ancestorId: z.number().int(),
  descendantId: z.number().int()
}).strict();
export const OrganizationClosureUpdateInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateInput>;
export const OrganizationClosureUpdateInputObjectZodSchema = makeSchema();
