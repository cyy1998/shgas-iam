import { z } from '@hono/zod-openapi';
// prettier-ignore
export const PositionRoleInputSchema = z.object({
    positionId: z.number().int(),
    roleId: z.number().int(),
    position: z.unknown(),
    role: z.unknown()
}).strict();

export type PositionRoleInputType = z.infer<typeof PositionRoleInputSchema>;
