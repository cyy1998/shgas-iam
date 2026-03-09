import { z } from '@hono/zod-openapi';

export const PrivilegeDelegationScalarFieldEnumSchema = z.enum(['id', 'delegatorUserId', 'delegateeUserId', 'organizationScopeId', 'startTime', 'endTime', 'status', 'description', 'isDelete', 'createTime', 'updateTime'])

export type PrivilegeDelegationScalarFieldEnum = z.infer<typeof PrivilegeDelegationScalarFieldEnumSchema>;