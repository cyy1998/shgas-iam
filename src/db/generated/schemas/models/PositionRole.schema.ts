import { z } from '@hono/zod-openapi';

export const PositionRoleSchema = z.object({
  positionId: z.number().int(),
  roleId: z.number().int(),
});

export type PositionRoleType = z.infer<typeof PositionRoleSchema>;
