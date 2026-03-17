import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutRolesNestedInput.schema';
import { RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutOrganizationsNestedInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  organization: z.lazy(() => OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional(),
  role: z.lazy(() => RoleUpdateOneRequiredWithoutOrganizationsNestedInputObjectSchema).optional()
}).strict();
export const OrganizationRoleUpdateInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateInput>;
export const OrganizationRoleUpdateInputObjectZodSchema = makeSchema();
