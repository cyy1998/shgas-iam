import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  depth: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const OrganizationClosureUpdateManyMutationInputObjectSchema: z.ZodType<Prisma.OrganizationClosureUpdateManyMutationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationClosureUpdateManyMutationInput>;
export const OrganizationClosureUpdateManyMutationInputObjectZodSchema = makeSchema();
