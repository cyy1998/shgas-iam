import * as z from 'zod';
// prettier-ignore
export const RolePrivilegeModelSchema = z.object({
    roleId: z.number().int(),
    privilegeId: z.number().int(),
    role: z.unknown(),
    privilege: z.unknown()
}).strict();

export type RolePrivilegePureType = z.infer<typeof RolePrivilegeModelSchema>;
