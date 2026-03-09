import { z } from '@hono/zod-openapi';
export const EmploymentRoleCreateManyResultSchema = z.object({
  count: z.number()
});