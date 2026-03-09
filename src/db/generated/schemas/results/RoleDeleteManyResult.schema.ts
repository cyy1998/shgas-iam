import { z } from '@hono/zod-openapi';
export const RoleDeleteManyResultSchema = z.object({
  count: z.number()
});