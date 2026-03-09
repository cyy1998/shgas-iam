import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { IntFieldUpdateOperationsInputObjectSchema as IntFieldUpdateOperationsInputObjectSchema } from './IntFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  delegationId: z.union([z.number().int(), z.lazy(() => IntFieldUpdateOperationsInputObjectSchema)]).optional()
}).strict();
export const DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectSchema: z.ZodType<Prisma.DelegationDetailUncheckedUpdateWithoutPrivilegeInput> = makeSchema() as unknown as z.ZodType<Prisma.DelegationDetailUncheckedUpdateWithoutPrivilegeInput>;
export const DelegationDetailUncheckedUpdateWithoutPrivilegeInputObjectZodSchema = makeSchema();
