import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { BoolFieldUpdateOperationsInputObjectSchema as BoolFieldUpdateOperationsInputObjectSchema } from './BoolFieldUpdateOperationsInput.schema';
import { OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema as OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './OrganizationUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  isAllSub: z.union([z.boolean(), z.lazy(() => BoolFieldUpdateOperationsInputObjectSchema)]).optional(),
  organization: z.lazy(() => OrganizationUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const OrganizationRoleUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.OrganizationRoleUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.OrganizationRoleUpdateWithoutRoleInput>;
export const OrganizationRoleUpdateWithoutRoleInputObjectZodSchema = makeSchema();
