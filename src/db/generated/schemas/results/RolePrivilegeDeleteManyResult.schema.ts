import { z } from '@hono/zod-openapi';
export const RolePrivilegeDeleteManyResultSchema = z.object({
  count: z.number()
});