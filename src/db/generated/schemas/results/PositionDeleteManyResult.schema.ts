import { z } from '@hono/zod-openapi';
export const PositionDeleteManyResultSchema = z.object({
  count: z.number()
});