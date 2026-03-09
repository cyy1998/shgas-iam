import { z } from '@hono/zod-openapi';
export const ClientUpdateManyResultSchema = z.object({
  count: z.number()
});