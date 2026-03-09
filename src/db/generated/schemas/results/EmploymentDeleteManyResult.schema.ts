import { z } from '@hono/zod-openapi';
export const EmploymentDeleteManyResultSchema = z.object({
  count: z.number()
});