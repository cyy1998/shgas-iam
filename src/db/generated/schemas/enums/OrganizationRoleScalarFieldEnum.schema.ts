import { z } from '@hono/zod-openapi';

export const OrganizationRoleScalarFieldEnumSchema = z.enum(['organizationId', 'roleId', 'isAllSub'])

export type OrganizationRoleScalarFieldEnum = z.infer<typeof OrganizationRoleScalarFieldEnumSchema>;