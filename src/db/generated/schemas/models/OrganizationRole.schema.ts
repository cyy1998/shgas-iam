import { z } from '@hono/zod-openapi';

export const OrganizationRoleSchema = z.object({
  organizationId: z.number().int(),
  roleId: z.number().int(),
  isAllSub: z.boolean().default(true),
});

export type OrganizationRoleType = z.infer<typeof OrganizationRoleSchema>;
