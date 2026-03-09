import { z } from '@hono/zod-openapi';

export const RoleScalarFieldEnumSchema = z.enum(['id', 'roleCode', 'roleName', 'clientId', 'status', 'description', 'isDelete', 'createTime', 'updateTime'])

export type RoleScalarFieldEnum = z.infer<typeof RoleScalarFieldEnumSchema>;