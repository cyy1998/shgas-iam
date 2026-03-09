import { z } from '@hono/zod-openapi';
export const ClientCreateManyResultSchema = z.object({
  count: z.number()
});