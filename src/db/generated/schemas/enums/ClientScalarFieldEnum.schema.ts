import * as z from 'zod';

export const ClientScalarFieldEnumSchema = z.enum(['id', 'clientCode', 'clientName', 'url', 'status', 'description', 'isDelete', 'createTime', 'updateTime', 'extAttributes'])

export type ClientScalarFieldEnum = z.infer<typeof ClientScalarFieldEnumSchema>;