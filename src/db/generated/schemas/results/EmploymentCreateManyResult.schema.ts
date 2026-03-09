import { z } from '@hono/zod-openapi';
export const EmploymentCreateManyResultSchema = z.object({
  count: z.number()
});