import * as z from 'zod';

export const PositionRoleSchema = z.object({
  positionId: z.number().int(),
  roleId: z.number().int(),
});

export type PositionRoleType = z.infer<typeof PositionRoleSchema>;
