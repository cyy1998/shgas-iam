import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPositionOrganizationsNestedInputObjectSchema).optional()
}).strict();
export const PosOrgRoleUpdateWithoutPosOrgInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateWithoutPosOrgInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateWithoutPosOrgInput>;
export const PosOrgRoleUpdateWithoutPosOrgInputObjectZodSchema = makeSchema();
