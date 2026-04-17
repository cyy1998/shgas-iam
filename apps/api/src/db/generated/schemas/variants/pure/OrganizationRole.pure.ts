import * as z from 'zod';
// prettier-ignore
export const OrganizationRoleModelSchema = z.object({
    organizationId: z.number().int(),
    roleId: z.number().int(),
    isAllSub: z.boolean(),
    organization: z.unknown(),
    role: z.unknown()
}).strict();

export type OrganizationRolePureType = z.infer<typeof OrganizationRoleModelSchema>;
