import * as z from 'zod';

export const PosOrgRoleScalarFieldEnumSchema = z.enum(['posOrgId', 'roleId'])

export type PosOrgRoleScalarFieldEnum = z.infer<typeof PosOrgRoleScalarFieldEnumSchema>;