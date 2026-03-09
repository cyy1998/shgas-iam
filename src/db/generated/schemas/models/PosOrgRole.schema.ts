import { z } from '@hono/zod-openapi';

export const PosOrgRoleSchema = z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int(),
});

export type PosOrgRoleType = z.infer<typeof PosOrgRoleSchema>;
