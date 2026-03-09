import { z } from '@hono/zod-openapi';
export const ClientDeleteManyResultSchema = z.object({
  count: z.number()
});