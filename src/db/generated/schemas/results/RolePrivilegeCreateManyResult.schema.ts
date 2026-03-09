import { z } from '@hono/zod-openapi';
export const RolePrivilegeCreateManyResultSchema = z.object({
  count: z.number()
});