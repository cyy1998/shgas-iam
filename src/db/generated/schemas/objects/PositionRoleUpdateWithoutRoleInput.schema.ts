import { z } from '@hono/zod-openapi';
import type { Prisma } from '../../prisma/client';
import { PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema as PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema } from './PositionUpdateOneRequiredWithoutRolesNestedInput.schema'

const makeSchema = () => z.object({
  position: z.lazy(() => PositionUpdateOneRequiredWithoutRolesNestedInputObjectSchema).optional()
}).strict();
export const PositionRoleUpdateWithoutRoleInputObjectSchema: z.ZodType<Prisma.PositionRoleUpdateWithoutRoleInput> = makeSchema() as unknown as z.ZodType<Prisma.PositionRoleUpdateWithoutRoleInput>;
export const PositionRoleUpdateWithoutRoleInputObjectZodSchema = makeSchema();
