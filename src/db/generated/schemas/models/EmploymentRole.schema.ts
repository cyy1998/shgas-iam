import { z } from '@hono/zod-openapi';

export const EmploymentRoleSchema = z.object({
  employmentId: z.number().int(),
  roleId: z.number().int(),
});

export type EmploymentRoleType = z.infer<typeof EmploymentRoleSchema>;
