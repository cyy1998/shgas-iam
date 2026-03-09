import { z } from '@hono/zod-openapi';
export const UserDeleteManyResultSchema = z.object({
  count: z.number()
});