import { z } from '@hono/zod-openapi';
export const PositionRoleDeleteResultSchema = z.nullable(z.object({
  positionId: z.number().int(),
  roleId: z.number().int(),
  position: z.unknown(),
  role: z.unknown()
}));