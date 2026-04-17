import * as z from 'zod';
// prettier-ignore
export const PositionRoleModelSchema = z.object({
    positionId: z.number().int(),
    roleId: z.number().int(),
    position: z.unknown(),
    role: z.unknown()
}).strict();

export type PositionRolePureType = z.infer<typeof PositionRoleModelSchema>;
