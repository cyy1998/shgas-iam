import * as z from 'zod';
import type { Prisma } from '../../prisma/client';
import { PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PositionUpdateOneRequiredWithoutRolesNestedInput.schema';
import { RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPositionsNestedInput.schema'

const makeSchema = () => z.object({
  position: z.lazy(() => PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional(),
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema).optional()
}).strict();
export const PositionRoleUpdateInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateInput>;
export const PositionRoleUpdateInputObjectZodSchema = makeSchema();
