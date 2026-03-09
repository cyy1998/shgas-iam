import { z } from '@hono/zod-openapi';
// prettier-ignore
export const PosOrgRoleModelSchema = z.object({
    posOrgId: z.number().int(),
    roleId: z.number().int(),
    posOrg: z.unknown(),
    role: z.unknown()
}).strict();

export type PosOrgRolePureType = z.infer<typeof PosOrgRoleModelSchema>;
