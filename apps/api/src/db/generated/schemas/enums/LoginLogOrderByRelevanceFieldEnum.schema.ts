import * as z from 'zod';

export const LoginLogOrderByRelevanceFieldEnumSchema = z.enum(['username', 'name', 'clientCode', 'loginType'])

export type LoginLogOrderByRelevanceFieldEnum = z.infer<typeof LoginLogOrderByRelevanceFieldEnumSchema>;