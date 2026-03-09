import { z } from '@hono/zod-openapi';
export const PositionUpdateManyResultSchema = z.object({
  count: z.number()
});