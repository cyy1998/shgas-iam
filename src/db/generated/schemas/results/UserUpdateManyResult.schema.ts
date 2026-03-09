import { z } from '@hono/zod-openapi';
export const UserUpdateManyResultSchema = z.object({
  count: z.number()
});