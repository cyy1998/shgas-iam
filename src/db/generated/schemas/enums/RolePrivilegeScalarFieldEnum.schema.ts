import { z } from '@hono/zod-openapi';

export const RolePrivilegeScalarFieldEnumSchema = z.enum(['roleId', 'privilegeId'])

export type RolePrivilegeScalarFieldEnum = z.infer<typeof RolePrivilegeScalarFieldEnumSchema>;