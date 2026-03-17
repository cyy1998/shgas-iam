import * as z from 'zod';
// prettier-ignore
export const PosOrgRoleInputSchema = z.object({
    posOrgId: z.number().int(),
    roleId: z.number().int(),
    posOrg: z.unknown(),
    role: z.unknown()
}).strict();

export type PosOrgRoleInputType = z.infer<typeof PosOrgRoleInputSchema>;
