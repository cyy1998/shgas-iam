import { z } from '@hono/zod-openapi';
// prettier-ignore
export const RolePrivilegeResultSchema = z.object({
    roleId: z.number().int(),
    privilegeId: z.number().int(),
    role: z.unknown(),
    privilege: z.unknown()
}).strict();

export type RolePrivilegeResultType = z.infer<typeof RolePrivilegeResultSchema>;
