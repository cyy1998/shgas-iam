import { z } from '@hono/zod-openapi';
export const PosOrgRoleDeleteManyResultSchema = z.object({
  count: z.number()
});