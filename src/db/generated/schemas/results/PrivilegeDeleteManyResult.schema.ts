import { z } from '@hono/zod-openapi';
export const PrivilegeDeleteManyResultSchema = z.object({
  count: z.number()
});