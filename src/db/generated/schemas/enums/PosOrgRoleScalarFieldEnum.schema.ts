import { z } from '@hono/zod-openapi';

export const PosOrgRoleScalarFieldEnumSchema = z.enum(['posOrgId', 'roleId'])

export type PosOrgRoleScalarFieldEnum = z.infer<typeof PosOrgRoleScalarFieldEnumSchema>;