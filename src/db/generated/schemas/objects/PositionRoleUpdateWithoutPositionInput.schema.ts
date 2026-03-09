import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema as RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema } from './RoleUpdateOneRequiredWithoutPositionsNestedInput.schema'

const makeSchema = () => z.object({
  role: z.lazy(() => RoleUpdateOneRequiredWithoutPositionsNestedInputObjectSchema).optional()
}).strict();
export const PositionRoleUpdateWithoutPositionInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateWithoutPositionInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateWithoutPositionInput>;
export const PositionRoleUpdateWithoutPositionInputObjectZodSchema = makeSchema();
