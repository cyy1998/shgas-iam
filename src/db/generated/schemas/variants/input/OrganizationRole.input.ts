import * as z from 'zod';
// prettier-ignore
export const OrganizationRoleInputSchema = z.object({
    organizationId: z.number().int(),
    roleId: z.number().int(),
    isAllSub: z.boolean(),
    organization: z.unknown(),
    role: z.unknown()
}).strict();

export type OrganizationRoleInputType = z.infer<typeof OrganizationRoleInputSchema>;
