import { z } from '@hono/zod-openapi';
export const PositionRoleCreateManyResultSchema = z.object({
  count: z.number()
});