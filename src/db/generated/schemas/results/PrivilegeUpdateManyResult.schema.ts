import { z } from '@hono/zod-openapi';
export const PrivilegeUpdateManyResultSchema = z.object({
  count: z.number()
});