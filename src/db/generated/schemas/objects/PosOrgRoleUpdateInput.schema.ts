import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInput.schema';
import { RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInput.schema'

const makeSchema = () => z.object({
  posOrg: z.lazy(() => PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional(),
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema).optional()
}).strict();
export const PosOrgRoleUpdateInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateInput>;
export const PosOrgRoleUpdateInputObjectZodSchema = makeSchema();
