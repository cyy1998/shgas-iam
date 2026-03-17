import * as z from 'zod';

export const RolePrivilegeScalarFieldEnumSchema = z.enum(['roleId', 'privilegeId'])

export type RolePrivilegeScalarFieldEnum = z.infer<typeof RolePrivilegeScalarFieldEnumSchema>;