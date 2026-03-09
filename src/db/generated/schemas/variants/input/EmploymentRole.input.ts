import { z } from '@hono/zod-openapi';
// prettier-ignore
export const EmploymentRoleInputSchema = z.object({
    employmentId: z.number().int(),
    roleId: z.number().int(),
    employment: z.unknown(),
    role: z.unknown()
}).strict();

export type EmploymentRoleInputType = z.infer<typeof EmploymentRoleInputSchema>;
