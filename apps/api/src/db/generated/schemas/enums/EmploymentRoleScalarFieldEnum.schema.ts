import * as z from 'zod';

export const EmploymentRoleScalarFieldEnumSchema = z.enum(['employmentId', 'roleId'])

export type EmploymentRoleScalarFieldEnum = z.infer<typeof EmploymentRoleScalarFieldEnumSchema>;