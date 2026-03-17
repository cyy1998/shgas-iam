import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  posOrg: z.lazy(() => PosOrgCompositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const PosOrgRoleUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PosOrgRoleUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PosOrgRoleUpdateWithoutRoleInput>;
export const PosOrgRoleUpdateWithoutRoleInputObjectZodSchema = makeSchema();
