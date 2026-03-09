import { z } from '@hono/zod-openapi';

export const PrivilegeScalarFieldEnumSchema = z.enum(['id', 'privilegeCode', 'privilegeName', 'fieldValues', 'status', 'description', 'isDelete', 'createTime', 'updateTime'])

export type PrivilegeScalarFieldEnum = z.infer<typeof PrivilegeScalarFieldEnumSchema>;