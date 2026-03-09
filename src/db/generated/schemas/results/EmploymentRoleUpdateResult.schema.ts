import { z } from '@hono/zod-openapi';
export const EmploymentRoleUpdateResultSchema = z.nullable(z.object({
  employmentId: z.number().int(),
  roleId: z.number().int(),
  employment: z.unknown(),
  role: z.unknown()
}));