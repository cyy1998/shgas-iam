import { z } from '@hono/zod-openapi';

export const PosOrgCompositionScalarFieldEnumSchema = z.enum(['id', 'posId', 'orgId', 'status', 'description', 'isDelete', 'createTime', 'updateTime'])

export type PosOrgCompositionScalarFieldEnum = z.infer<typeof PosOrgCompositionScalarFieldEnumSchema>;