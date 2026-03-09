import { z } from '@hono/zod-openapi';

export const ClientScalarFieldEnumSchema = z.enum(['id', 'clientCode', 'clientName', 'url', 'status', 'description', 'isDelete', 'createTime', 'updateTime', 'extAttributes'])

export type ClientScalarFieldEnum = z.infer<typeof ClientScalarFieldEnumSchema>;