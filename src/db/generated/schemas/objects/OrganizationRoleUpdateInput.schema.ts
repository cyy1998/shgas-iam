import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  organizationId: z.number().int(),
  roleId: z.number().int()
}).strict();
export const OrganizationRoleUpdateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateInput>;
export const OrganizationRoleUpdateInputObjectZodSchema = makeSchema();
