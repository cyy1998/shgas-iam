import * as z from 'zod';

export const UserScalarFieldEnumSchema = z.enum(['id', 'username', 'wxId', 'name', 'password', 'mobile', 'userType', 'orderNum', 'status', 'isDelete', 'createTime', 'updateTime'])

export type UserScalarFieldEnum = z.infer<typeof UserScalarFieldEnumSchema>;