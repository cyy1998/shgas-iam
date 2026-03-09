import { z } from '@hono/zod-openapi';
// prettier-ignore
export const EmploymentRoleModelSchema = z.object({
    employmentId: z.number().int(),
    roleId: z.number().int(),
    employment: z.unknown(),
    role: z.unknown()
}).strict();

export type EmploymentRolePureType = z.infer<typeof EmploymentRoleModelSchema>;
