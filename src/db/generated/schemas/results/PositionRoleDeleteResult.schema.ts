import * as z from 'zod';
export const PositionRoleDeleteResultSchema = z.nullable(z.object({
  positionId: z.number().int(),
  roleId: z.number().int(),
  position: z.unknown(),
  role: z.unknown()
}));