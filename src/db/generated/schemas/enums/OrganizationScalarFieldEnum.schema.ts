import * as z from 'zod';

export const OrganizationScalarFieldEnumSchema = z.enum(['id', 'orgCode', 'orgName', 'parentId', 'businessParentId', 'path', 'level', 'orgType', 'orderNum', 'isVirtual', 'isEntity', 'status', 'isDelete', 'createTime', 'updateTime'])

export type OrganizationScalarFieldEnum = z.infer<typeof OrganizationScalarFieldEnumSchema>;