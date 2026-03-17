import * as z from 'zod';

export const OrganizationRoleScalarFieldEnumSchema = z.enum(['organizationId', 'roleId', 'isAllSub'])

export type OrganizationRoleScalarFieldEnum = z.infer<typeof OrganizationRoleScalarFieldEnumSchema>;