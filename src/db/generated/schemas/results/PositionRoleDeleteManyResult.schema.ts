import { z } from '@hono/zod-openapi';
export const PositionRoleDeleteManyResultSchema = z.object({
  count: z.number()
});