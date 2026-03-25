import * as z from 'zod';

export const LoginLogScalarFieldEnumSchema = z.enum(['id', 'userId', 'username', 'name', 'clientCode', 'loginType', 'loginTime'])

export type LoginLogScalarFieldEnum = z.infer<typeof LoginLogScalarFieldEnumSchema>;