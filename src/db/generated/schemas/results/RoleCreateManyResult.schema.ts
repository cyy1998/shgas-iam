import { z } from '@hono/zod-openapi';
export const RoleCreateManyResultSchema = z.object({
  count: z.number()
});