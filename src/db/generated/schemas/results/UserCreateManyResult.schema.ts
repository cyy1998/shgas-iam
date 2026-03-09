import { z } from '@hono/zod-openapi';
export const UserCreateManyResultSchema = z.object({
  count: z.number()
});