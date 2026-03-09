import { z } from '@hono/zod-openapi';
// prettier-ignore
export const RolePrivilegeInputSchema = z.object({
    roleId: z.number().int(),
    privilegeId: z.number().int(),
    role: z.unknown(),
    privilege: z.unknown()
}).strict();

export type RolePrivilegeInputType = z.infer<typeof RolePrivilegeInputSchema>;
