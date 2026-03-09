import { z } from '@hono/zod-openapi';

export const EmploymentRoleScalarFieldEnumSchema = z.enum(['employmentId', 'roleId'])

export type EmploymentRoleScalarFieldEnum = z.infer<typeof EmploymentRoleScalarFieldEnumSchema>;