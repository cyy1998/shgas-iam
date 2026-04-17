import * as z from 'zod';
// prettier-ignore
export const PositionRoleResultSchema = z.object({
    positionId: z.number().int(),
    roleId: z.number().int(),
    position: z.unknown(),
    role: z.unknown()
}).strict();

export type PositionRoleResultType = z.infer<typeof PositionRoleResultSchema>;
