import { z } from '@hono/zod-openapi';
// prettier-ignore
export const OrganizationRoleResultSchema = z.object({
    organizationId: z.number().int(),
    roleId: z.number().int(),
    isAllSub: z.boolean(),
    organization: z.unknown(),
    role: z.unknown()
}).strict();

export type OrganizationRoleResultType = z.infer<typeof OrganizationRoleResultSchema>;
