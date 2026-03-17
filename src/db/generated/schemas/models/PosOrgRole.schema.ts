import * as z from 'zod';

export const PosOrgRoleSchema = z.object({
  posOrgId: z.number().int(),
  roleId: z.number().int(),
});

export type PosOrgRoleType = z.infer<typeof PosOrgRoleSchema>;
