import { z } from '@hono/zod-openapi';
export const EmploymentRoleDeleteManyResultSchema = z.object({
  count: z.number()
});