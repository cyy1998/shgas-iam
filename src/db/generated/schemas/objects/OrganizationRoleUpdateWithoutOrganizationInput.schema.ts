import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutOrganizationsNestedInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  role: z.lazy(() => RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema).optional()
}).strict();
export const OrganizationRoleUpdateWithoutOrganizationInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateWithoutOrganizationInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateWithoutOrganizationInput>;
export const OrganizationRoleUpdateWithoutOrganizationInputObjectZodSchema = makeSchema();
