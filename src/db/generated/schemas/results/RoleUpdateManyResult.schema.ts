import { z } from '@hono/zod-openapi';
export const RoleUpdateManyResultSchema = z.object({
  count: z.number()
});